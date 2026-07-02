import { Router } from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = Router();

// Swapped from Fireworks to Pollinations AI (Keyless)
const COACH_API_URL = process.env.COACH_API_URL || 'https://text.pollinations.ai/openai/chat/completions';
const COACH_MODEL = process.env.COACH_MODEL || 'openai';

const SYSTEM_PROMPT = `You are an expert chess coach with deep strategic knowledge. Think carefully about each position before responding. Analyze the position thoroughly, considering:
- Tactical threats and opportunities
- Positional factors (piece activity, pawn structure, king safety)
- Strategic plans for both sides

Provide insightful, educational feedback that helps the student improve their chess understanding.`;

async function callCoach(messages, options = {}) {
  const {
    stream = false,
    maxTokens = 500,
    temperature = 0.7
  } = options;
  
  const headers = {
    'Content-Type': 'application/json',
  };

  // Pollinations AI does not require a key, but we can pass one if configured
  const apiKey = process.env.COACH_API_KEY || process.env.FIREWORKS_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(COACH_API_URL, {
    method: 'POST',
    headers,
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
    throw new Error(`Coach API error: ${response.status} - ${error}`);
  }

  return response;
}

function extractJson(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch { }
    }

    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1));
      } catch { }
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

router.post('/feedback', async (req, res) => {
  try {
    const { fen, playerMove, moveHistory } = req.body;
    if (!fen || !playerMove) return errorResponse(res, 400, 'Missing required fields: fen, playerMove');

    const moves = Array.isArray(moveHistory) ? moveHistory.join(' ') : '';
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: `A student just played ${playerMove} in this position.\n\nPosition (FEN before move): ${fen}\nMove history: ${moves}\nLast move: ${playerMove}\n\nThink through the position carefully, then give short, encouraging feedback (1-2 sentences, max 30 words). Focus on:\n- If it's a good move, explain why briefly\n- If there was a better move, gently suggest it\n- Mention any tactical or positional concept they should notice\n\nBe concise and supportive. No greetings or sign-offs.` 
      }
    ];

    const response = await callCoach(messages);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    res.json({ feedback: text });
  } catch (error) {
    console.error('[Coach] Feedback error:', error);
    return handleRouteError(res, error, 'Failed to get coaching feedback');
  }
});

router.post('/explain', async (req, res) => {
  try {
    const { fenBefore, move, fenAfter } = req.body;
    if (!fenBefore || !move) return errorResponse(res, 400, 'Missing required fields: fenBefore, move');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: `You are explaining your move to a student.\n\nPosition before: ${fenBefore}\nMove played: ${move}\nPosition after: ${fenAfter || 'N/A'}\n\nThink through why this move is strong, then explain it in 1-2 very short sentences (max 25 words). Focus on the main idea - is it developing a piece, controlling the center, creating a threat, defending, or setting up a tactic? Be educational but concise.` 
      }
    ];

    const response = await callCoach(messages);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    res.json({ explanation: text });
  } catch (error) {
    console.error('[Coach] Explain error:', error);
    return handleRouteError(res, error, 'Failed to get move explanation');
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const { moveHistory: rawMoveHistory, result: rawResult, gameId } = req.body;
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
            if (!result && gameResult.rows[0].result) result = gameResult.rows[0].result;
          }
        } catch (error) { }
      }
    }

    if (!moveHistory || !Array.isArray(moveHistory) || moveHistory.length === 0) {
      return errorResponse(res, 400, 'Missing required field: moveHistory (array)');
    }

    const sanMoves = moveHistory.map(entry => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed?.san) return parsed.san;
          } catch { }
        }
        return trimmed;
      }
      return entry?.san || '';
    }).filter(Boolean);

    const moves = sanMoves.map((san, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      return i % 2 === 0 ? `${moveNum}. ${san}` : san;
    }).join(' ');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: `Review every move in this game for a student who wants to improve.\n\nMoves: ${moves}\nResult: ${result || 'Unknown'}\n\nFor EACH move, write 1-2 concise sentences of feedback, using the previous moves as context.\nFocus on why the move is good or questionable, and mention tactical or positional ideas.\n\nReturn ONLY valid JSON. Output a JSON array with one object per move:\n[\n  {\n    "ply": 1,\n    "moveNumber": 1,\n    "color": "white",\n    "san": "e4",\n    "review": "Brief coaching feedback."\n  }\n]\n\nRules:\n- The array length must match the number of moves.\n- Use "white" for odd plies and "black" for even plies.\n- Keep each review under 30 words.\n- No extra commentary, no markdown, no code fences.` 
      }
    ];

    const moveCount = sanMoves.length;
    const maxTokens = Math.min(2000, Math.max(600, 120 + moveCount * 30));
    const response = await callCoach(messages, { maxTokens });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(text);
    const rawMoves = Array.isArray(parsed?.moves) ? parsed.moves : Array.isArray(parsed) ? parsed : null;

    if (!rawMoves) return res.json({ analysis: text });

    const movesReview = rawMoves.map((entry, index) => ({
      ply: Number.isFinite(entry?.ply) ? entry.ply : index + 1,
      moveNumber: Number.isFinite(entry?.moveNumber) ? entry.moveNumber : Math.floor(index / 2) + 1,
      color: entry?.color === 'black' || index % 2 === 1 ? 'black' : 'white',
      san: entry?.san || sanMoves[index] || '',
      review: entry?.review || entry?.comment || entry?.analysis || ''
    }));

    res.json({ analysis: { format: 'move_review', moves: movesReview } });
  } catch (error) {
    console.error('[Coach] Analyze error:', error);
    return handleRouteError(res, error, 'Failed to analyze game');
  }
});

router.get('/status', (req, res) => {
  res.json({ 
    available: true,
    model: COACH_MODEL,
    provider: 'pollinations-ai',
    endpoint: COACH_API_URL,
    usingApiKey: !!(process.env.COACH_API_KEY || process.env.FIREWORKS_API_KEY)
  });
});

export default router;
