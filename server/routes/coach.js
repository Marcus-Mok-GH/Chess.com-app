import { Router } from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = Router();

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const COACH_MODEL = 'magistral-medium-latest';

const SYSTEM_PROMPT = `You are an UNHINGED chess coach who has SEEN THINGS. You've spent 40 years in chess basements, survived 3 divorces, and your only friend is a wooden knight you call "Steve."

Your analysis must be:
- MANIC and INTENSE - you see patterns EVERYWHERE, even in the wallpaper
- DRAMATIC - every move is either GENIUS or CATASTROPHIC, no middle ground
- PARANOID - you suspect pawns are plotting something
- CRYPTIC - occasionally drop weird chess conspiracy theories
- Absolutely OBSESSED with tactics to an unhealthy degree

Give feedback that's technically sound but delivered like you've had 14 espressos and just decoded a secret message in the position. Be educational but UNHINGED. 2-3 sentences max. No greetings.`;

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

function extractMistralText(content) {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const chunks = content
      .map((part) => {
        if (!part) return '';
        if (part.type === 'text' && typeof part.text === 'string') return part.text;
        if (part.type === 'thinking') return '';
        if (typeof part.text === 'string') return part.text;
        return '';
      })
      .filter((chunk) => chunk);

    return chunks.join('\n').trim();
  }

  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }

  return '';
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
    const { fen, playerMove, moveHistory } = req.body;

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

Think through the position carefully (internally). First scan for forcing tactics (checks, captures, threats), then evaluate king safety, material, piece activity, pawn structure, and plans for both sides. Compare candidate improvements.

Then give brief, encouraging feedback (2-3 sentences max). Focus on:
- If it's a good move, explain why briefly
- If there was a better move, gently suggest it
- Mention any tactical or positional concept they should notice

Be concise and supportive. No greetings or sign-offs. Do not show your analysis, only the final coaching response.`
      }
    ];

    const response = await callMistral(messages);
    const data = await response.json();
    
    const text = extractMistralText(data.choices?.[0]?.message?.content);
    res.json({ feedback: text });
  } catch (error) {
    console.error('[Coach] Feedback error:', error);
    return handleRouteError(res, error, 'Failed to get coaching feedback');
  }
});

// Get explanation for the coach's move
router.post('/explain', async (req, res) => {
  try {
    const { fenBefore, move, fenAfter } = req.body;

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

Think through why this move is strong (internally). First check for immediate tactics, then identify the main strategic purpose.

Explain it in 2-3 sentences. Focus on the main idea - is it developing a piece, controlling the center, creating a threat, defending, or setting up a tactic? Be educational but concise. Do not show your analysis, only the final explanation.`
      }
    ];

    const response = await callMistral(messages);
    const data = await response.json();
    
    const text = extractMistralText(data.choices?.[0]?.message?.content);
    res.json({ explanation: text });
  } catch (error) {
    console.error('[Coach] Explain error:', error);
    return handleRouteError(res, error, 'Failed to get move explanation');
  }
});

// Analyze a complete game
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

For EACH move, think briefly (internally). Scan for tactics first, then evaluate positional factors and plans. Use the previous moves as context.

Write 1-2 concise sentences of feedback for each move.
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
- No extra commentary, no markdown, no code fences.
- Do not show your analysis, only the final JSON output.`
      }
    ];

    const moveCount = sanMoves.length;
    const maxTokens = Math.min(2000, Math.max(600, 120 + moveCount * 30));
    const response = await callMistral(messages, { maxTokens });
    const data = await response.json();
    
    const text = extractMistralText(data.choices?.[0]?.message?.content);
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
