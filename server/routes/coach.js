import { Router } from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = Router();

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const COACH_MODEL = 'mistral-large-latest';

const SYSTEM_PROMPT = `You are an expert chess coach with deep strategic knowledge. Think carefully about each position before responding. Analyze the position thoroughly, considering:
- Tactical threats and opportunities
- Positional factors (piece activity, pawn structure, king safety)
- Strategic plans for both sides

Provide insightful, educational feedback that helps the student improve their chess understanding.`;

const DIALOGUE_SYSTEM_PROMPT = `You are a chess opponent speaking directly to the player. Stay in character based on the bot persona provided. Keep responses short, clear, and within 20 words. Do not use emojis, quotes, or markdown. Avoid toxic or insulting language.`;

async function callMistral(messages, options = {}) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const {
    stream = false,
    maxTokens = 500,
    temperature = 0.7
  } = options;
  
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: COACH_MODEL,
      messages,
      stream,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  return response;
}

function initSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function sendSse(res, data, event = null) {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`data: ${payload}\n\n`);
}

async function streamMistralToClient(mistralResponse, res) {
  initSse(res);

  const reader = mistralResponse.body?.getReader();
  if (!reader) {
    sendSse(res, { error: 'Streaming unavailable' }, 'error');
    res.end();
    return '';
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let closed = false;

  const handleClose = () => {
    closed = true;
    reader.cancel().catch(() => {});
  };

  res.on('close', handleClose);

  try {
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          sendSse(res, '[DONE]', 'done');
          res.end();
          return fullText;
        }

        try {
          const payload = JSON.parse(data);
          const delta = payload?.choices?.[0]?.delta?.content
            || payload?.choices?.[0]?.message?.content
            || '';

          if (delta) {
            fullText += delta;
            sendSse(res, { delta });
          }
        } catch (error) {
          // Ignore malformed SSE chunks
        }
      }
    }
  } catch (error) {
    if (!closed) {
      sendSse(res, { error: error?.message || 'Stream error' }, 'error');
      res.end();
    }
    return fullText;
  } finally {
    res.off('close', handleClose);
  }

  sendSse(res, '[DONE]', 'done');
  res.end();
  return fullText;
}

function cleanDialogueText(text) {
  if (!text) return '';
  let cleaned = text.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^["“”']+/, '').replace(/["“”']+$/, '');
  return cleaned;
}

function extractJson(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Attempt to extract JSON array or object from surrounding text
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch {
        // fallthrough
      }
    }

    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1));
      } catch {
        // fallthrough
      }
    }
  }

  return null;
}

function parsePgTextArrayLiteral(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const items = [];
  let current = '';
  let inQuotes = false;
  let escape = false;

  for (let i = 1; i < trimmed.length - 1; i += 1) {
    const ch = trimmed[i];

    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ',') {
      items.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  items.push(current);
  return items;
}

function normalizeMoveHistoryPayload(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const parsedArray = parsePgTextArrayLiteral(raw);
      return parsedArray || [];
    }
  }

  return [];
}

// Get coaching feedback for a player's move
router.post('/feedback', async (req, res) => {
  try {
    const { fen, playerMove, moveHistory, stream } = req.body;

    if (!fen || !playerMove) {
      return errorResponse(res, 400, 'Missing required fields: fen, playerMove');
    }

    const moves = Array.isArray(moveHistory) ? moveHistory.join(' ') : '';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `A student just played ${playerMove} in this position.

Position (FEN before move): ${fen}
Move history: ${moves}
Last move: ${playerMove}

Think through the position carefully, then give brief, encouraging feedback (2-3 sentences max). Focus on:
- If it's a good move, explain why briefly
- If there was a better move, gently suggest it
- Mention any tactical or positional concept they should notice

Be concise and supportive. No greetings or sign-offs.`
      }
    ];

    if (stream) {
      const response = await callMistral(messages, { stream: true });
      await streamMistralToClient(response, res);
      return;
    }

    const response = await callMistral(messages);
    const data = await response.json();

    const text = data.choices?.[0]?.message?.content || '';
    res.json({ feedback: text });
  } catch (error) {
    console.error('[Coach] Feedback error:', error);
    return handleRouteError(res, error, 'Failed to get coaching feedback');
  }
});

// Get explanation for the coach's move
router.post('/explain', async (req, res) => {
  try {
    const { fenBefore, move, fenAfter, stream } = req.body;

    if (!fenBefore || !move) {
      return errorResponse(res, 400, 'Missing required fields: fenBefore, move');
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `You are explaining your move to a student.

Position before: ${fenBefore}
Move played: ${move}
Position after: ${fenAfter || 'N/A'}

Think through why this move is strong, then explain it in 2-3 sentences. Focus on the main idea - is it developing a piece, controlling the center, creating a threat, defending, or setting up a tactic? Be educational but concise.`
      }
    ];

    if (stream) {
      const response = await callMistral(messages, { stream: true });
      await streamMistralToClient(response, res);
      return;
    }

    const response = await callMistral(messages);
    const data = await response.json();

    const text = data.choices?.[0]?.message?.content || '';
    res.json({ explanation: text });
  } catch (error) {
    console.error('[Coach] Explain error:', error);
    return handleRouteError(res, error, 'Failed to get move explanation');
  }
});

// Analyze a complete game
router.post('/analyze', async (req, res) => {
  try {
    const { moveHistory: rawMoveHistory, result: rawResult, gameId, stream } = req.body;
    let moveHistory = normalizeMoveHistoryPayload(rawMoveHistory);
    let result = rawResult;

    if (!Array.isArray(moveHistory) || moveHistory.length === 0) {
      if (gameId) {
        try {
          const gameResult = await query(
            'SELECT move_history, result FROM games WHERE game_code = $1 LIMIT 1',
            [String(gameId).toUpperCase()]
          );
          if (gameResult.rows.length > 0) {
            moveHistory = normalizeMoveHistoryPayload(gameResult.rows[0].move_history);
            if (!result && gameResult.rows[0].result) {
              result = gameResult.rows[0].result;
            }
          }
        } catch (error) {
          console.warn('[Coach] Failed to load move history from database:', error?.message || error);
        }
      }
    }

    if (!moveHistory || !Array.isArray(moveHistory) || moveHistory.length === 0) {
      return errorResponse(res, 400, 'Missing required field: moveHistory (array)');
    }

    const sanMoves = moveHistory
      .map((entry) => {
        if (typeof entry === 'string') {
          const trimmed = entry.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object' && parsed.san) {
                return parsed.san;
              }
            } catch {
              // fallthrough to raw string
            }
          }
          return trimmed;
        }
        if (entry && typeof entry === 'object') {
          return entry.san || '';
        }
        return '';
      })
      .filter(Boolean);

    const moves = sanMoves
      .map((san, i) => {
        const moveNum = Math.floor(i / 2) + 1;
        return i % 2 === 0 ? `${moveNum}. ${san}` : san;
      })
      .join(' ');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Review every move in this game for a student who wants to improve.

Moves: ${moves}
Result: ${result || 'Unknown'}

For EACH move, write 1-2 concise sentences of feedback, using the previous moves as context.
Focus on why the move is good or questionable, and mention tactical or positional ideas.

Return ONLY valid JSON. Output a JSON array with one object per move:
[
  {
    "ply": 1,
    "moveNumber": 1,
    "color": "white",
    "san": "e4",
    "review": "Brief coaching feedback."
  }
]

Rules:
- The array length must match the number of moves.
- Use "white" for odd plies and "black" for even plies.
- Keep each review under 30 words.
- No extra commentary, no markdown, no code fences.`
      }
    ];

    const moveCount = sanMoves.length;
    const maxTokens = Math.min(2000, Math.max(600, 120 + moveCount * 30));

    if (stream) {
      const response = await callMistral(messages, { stream: true, maxTokens });
      await streamMistralToClient(response, res);
      return;
    }

    const response = await callMistral(messages, { maxTokens });
    const data = await response.json();

    const text = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(text);

    const rawMoves = Array.isArray(parsed?.moves)
      ? parsed.moves
      : Array.isArray(parsed)
        ? parsed
        : null;

    if (!rawMoves) {
      return res.json({ analysis: text });
    }

    const movesReview = rawMoves.map((entry, index) => {
      const color = entry?.color === 'black' || index % 2 === 1 ? 'black' : 'white';
      const moveNumber = Number.isFinite(entry?.moveNumber)
        ? entry.moveNumber
        : Math.floor(index / 2) + 1;
      const ply = Number.isFinite(entry?.ply) ? entry.ply : index + 1;
      const san = entry?.san || sanMoves[index] || '';
      const review = entry?.review || entry?.comment || entry?.analysis || '';

      return {
        ply,
        moveNumber,
        color,
        san,
        review
      };
    });

    res.json({ analysis: { format: 'move_review', moves: movesReview } });
  } catch (error) {
    console.error('[Coach] Analyze error:', error);
    return handleRouteError(res, error, 'Failed to analyze game');
  }
});

// Generate short bot dialogue lines
router.post('/dialogue', async (req, res) => {
  try {
    const { bot, event, actor, move, result, fen, stream } = req.body;

    if (!bot?.name || !event) {
      return errorResponse(res, 400, 'Missing required fields: bot.name, event');
    }

    const moveText = typeof move === 'string'
      ? move
      : move?.san || move?.uci || '';

    const personaLines = [
      `Bot name: ${bot.name}`,
      bot.personality ? `Personality: ${bot.personality}` : null,
      bot.description ? `Description: ${bot.description}` : null,
      bot.rating ? `Rating: ${bot.rating}` : null,
      bot.id ? `Bot id: ${bot.id}` : null
    ].filter(Boolean);

    const contextLines = [
      `Event: ${event}`,
      actor ? `Actor: ${actor}` : null,
      result ? `Result: ${result}` : null,
      moveText ? `Move: ${moveText}` : null,
      fen ? `FEN: ${fen}` : null
    ].filter(Boolean);

    const messages = [
      { role: 'system', content: DIALOGUE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Use the persona below to respond to the event.\n\n${personaLines.join('\n')}\n\n${contextLines.join('\n')}\n\nReply with a single sentence under 20 words.`
      }
    ];

    if (stream) {
      const response = await callMistral(messages, {
        stream: true,
        maxTokens: 80,
        temperature: 0.7
      });
      await streamMistralToClient(response, res);
      return;
    }

    const response = await callMistral(messages, {
      maxTokens: 80,
      temperature: 0.7
    });
    const data = await response.json();
    const text = cleanDialogueText(data.choices?.[0]?.message?.content || '');

    res.json({ text });
  } catch (error) {
    console.error('[Coach] Dialogue error:', error);
    return handleRouteError(res, error, 'Failed to generate dialogue');
  }
});

// Health check for coach API
router.get('/status', (req, res) => {
  const hasApiKey = !!process.env.MISTRAL_API_KEY;
  res.json({ 
    available: hasApiKey,
    model: COACH_MODEL,
    provider: 'mistral'
  });
});

export default router;
