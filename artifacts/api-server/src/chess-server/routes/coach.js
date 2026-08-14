import { Router } from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import {
  authenticatedUserId,
  coachAppRedirect,
  coachConfigurationStatus,
  completeAuthorization,
  createAuthorizationUrl,
  disconnectCoach,
  getCoachToken,
} from '../coachAuth.js';

const router = Router();
const COACH_API_URL = process.env.COACH_API_URL || 'https://gen.pollinations.ai/v1/chat/completions';
const COACH_MODEL = process.env.COACH_MODEL || 'openai-fast';
const COACH_FREE_MODEL = process.env.COACH_FREE_MODEL || 'YoannDev90/laguna-s-2.1:free';
const COACH_MODELS = [...new Set([COACH_MODEL, COACH_FREE_MODEL])];
const COACH_TIMEOUT_MS = parseInt(process.env.COACH_TIMEOUT_MS || '12000', 10);
const COACH_MAX_RETRIES = parseInt(process.env.COACH_MAX_RETRIES || '2', 10);
const SYSTEM_PROMPT = `You are an expert chess coach with deep strategic knowledge. Think carefully about each position before responding.

IMPORTANT: Provide ONLY short to medium length responses (max 2-3 sentences). Do not provide long explanations that take up the screen.

Analyze the position thoroughly, considering:
- Tactical threats and opportunities
- Positional factors (piece activity, pawn structure, king safety)
- Strategic plans for both sides

Provide insightful, educational, and EXTREMELY CONCISE feedback that helps the student improve their chess understanding.`;

async function callCoach(messages, options = {}) {
  const { userId, maxTokens = 500, temperature = 0.7 } = options;
  const token = await getCoachToken(userId);
  if (!token) {
    const error = new Error('Connect your Pollinations account to use the AI coach.');
    error.status = 402;
    throw error;
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  let lastError;
  for (const model of COACH_MODELS) {
    for (let attempt = 1; attempt <= COACH_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
      try {
        const response = await fetch(COACH_API_URL, {
          method: 'POST', headers, signal: controller.signal,
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const upstreamStatus = response.status;
          const error = new Error(`Coach API error: ${upstreamStatus} - ${await response.text()}`);
          error.status = upstreamStatus === 402 ? 402 : 502;
          throw error;
        }
        return response;
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        if (err.status === 402 || attempt === COACH_MAX_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    if (lastError?.status !== 402) break;
  }
  throw lastError;
}

async function callCoachFree(messages, options = {}) {
  const { maxTokens = 500, temperature = 0.7 } = options;
  const headers = { 'Content-Type': 'application/json' };
  let lastError;
  for (let attempt = 1; attempt <= COACH_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
    try {
      const response = await fetch(COACH_API_URL, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ model: COACH_FREE_MODEL, messages, max_tokens: maxTokens, temperature }),
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const upstreamStatus = response.status;
        const error = new Error(`Coach API error (free fallback): ${upstreamStatus} - ${await response.text()}`);
        error.status = upstreamStatus === 402 ? 402 : 502;
        throw error;
      }
      return response;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (err.status === 402 || attempt === COACH_MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function requireCoachUser(req, res) {
  const userId = await authenticatedUserId(req);
  if (!userId) {
    errorResponse(res, 401, 'Log in to use the AI coach.');
    return null;
  }
  return userId;
}

function extractJson(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    try { return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)); } catch {}
  }
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    try { return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)); } catch {}
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
    if (escape) { current += ch; escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes && ch === ',') { items.push(current); current = ''; continue; }
    current += ch;
  }
  items.push(current);
  return items;
}

function normalizeMoveHistoryPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return parsePgTextArrayLiteral(raw) || [];
  }
  return [];
}

router.post('/connect', async (req, res) => {
  try {
    const result = await createAuthorizationUrl(req);
    if (result.error) return errorResponse(res, 401, result.error);
    return res.json({ authorizationUrl: result.authorizationUrl });
  } catch (error) {
    console.error('[Coach] Connect error:', error);
    return handleRouteError(res, error, 'Pollinations coach is not configured on the server.');
  }
});

router.get('/connect', async (req, res) => {
  try {
    const result = await createAuthorizationUrl(req);
    if (result.error) return errorResponse(res, 401, result.error);
    return res.redirect(result.authorizationUrl);
  } catch (error) {
    console.error('[Coach] Connect error:', error);
    return handleRouteError(res, error, 'Pollinations coach is not configured on the server.');
  }
});

router.get('/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect(coachAppRedirect(req, `?coach_error=${encodeURIComponent(req.query.error)}`));
    if (!req.query.code || !req.query.state) return res.redirect(coachAppRedirect(req, '?coach_error=authorization_incomplete'));
    await completeAuthorization(String(req.query.code || ''), String(req.query.state || ''));
    return res.redirect(coachAppRedirect(req, '?coach_connected=1'));
  } catch (error) {
    console.error('[Coach] Callback error:', error);
    return res.redirect(coachAppRedirect(req, `?coach_error=${encodeURIComponent(error.message)}`));
  }
});

router.get('/status', async (req, res) => {
  try {
    const userId = await authenticatedUserId(req);
    const token = userId ? await getCoachToken(userId) : null;
    return res.json({
      available: coachConfigurationStatus(),
      connected: Boolean(token),
      model: COACH_MODEL,
      fallbackModel: COACH_FREE_MODEL,
      provider: 'pollinations-ai',
      billing: 'user-pays-with-free-fallback',
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to check AI coach status');
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    const userId = await requireCoachUser(req, res);
    if (!userId) return;
    await disconnectCoach(userId);
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to disconnect Pollinations coach');
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const userId = await requireCoachUser(req, res);
    if (!userId) return;
    const { fen, playerMove, moveHistory } = req.body;
    if (!fen || !playerMove) return errorResponse(res, 400, 'Missing required fields: fen, playerMove');
    const moves = Array.isArray(moveHistory) ? moveHistory.join(' ') : '';
    const feedbackMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `A student just played ${playerMove} in this position.\n\nPosition (FEN before move): ${fen}\nMove history: ${moves}\nLast move: ${playerMove}\n\nGive short, encouraging feedback (1-2 sentences, max 30 words). Explain why the move is good, or gently suggest a better move, and mention one tactical or positional concept. No greetings or sign-offs.` },
    ];
    let response;
    try {
      response = await callCoach(feedbackMessages, { userId });
    } catch (coachErr) {
      response = await callCoachFree(feedbackMessages, {});
    }
    const data = await response.json();
    return res.json({ feedback: data.choices?.[0]?.message?.content || '' });
  } catch (error) {
    if (error?.status === 402) return res.status(402).json({ error: error.message, code: 'POLLINATIONS_AUTH_REQUIRED' });
    return handleRouteError(res, error, 'Failed to get coaching feedback');
  }
});

router.post('/explain', async (req, res) => {
  try {
    const userId = await requireCoachUser(req, res);
    if (!userId) return;
    const { fenBefore, move, fenAfter } = req.body;
    if (!fenBefore || !move) return errorResponse(res, 400, 'Missing required fields: fenBefore, move');
    const explainMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Explain this move to a student in 1-2 very short sentences (max 25 words).\nPosition before: ${fenBefore}\nMove played: ${move}\nPosition after: ${fenAfter || 'N/A'}\nFocus on the main chess idea. Be educational but concise.` },
    ];
    let response;
    try {
      response = await callCoach(explainMessages, { userId });
    } catch (coachErr) {
      response = await callCoachFree(explainMessages, {});
    }
    const data = await response.json();
    return res.json({ explanation: data.choices?.[0]?.message?.content || '' });
  } catch (error) {
    if (error?.status === 402) return res.status(402).json({ error: error.message, code: 'POLLINATIONS_AUTH_REQUIRED' });
    return handleRouteError(res, error, 'Failed to get move explanation');
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const userId = await requireCoachUser(req, res);
    if (!userId) return;
    const { moveHistory: rawMoveHistory, result: rawResult, gameId } = req.body;
    let moveHistory = normalizeMoveHistoryPayload(rawMoveHistory);
    let result = rawResult;
    if ((!moveHistory.length) && gameId) {
      const gameResult = await query('SELECT move_history, result FROM games WHERE game_code = $1 LIMIT 1', [String(gameId).toUpperCase()]);
      if (gameResult.rows.length) {
        moveHistory = normalizeMoveHistoryPayload(gameResult.rows[0].move_history);
        if (!result) result = gameResult.rows[0].result;
      }
    }
    if (!moveHistory.length) return errorResponse(res, 400, 'Missing required field: moveHistory (array)');
    const sanMoves = moveHistory.map((entry) => {
      if (typeof entry === 'string') {
        try { const parsed = JSON.parse(entry); if (parsed?.san) return parsed.san; } catch {}
        return entry.trim();
      }
      return entry?.san || '';
    }).filter(Boolean);
    const moves = sanMoves.map((san, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${san}`).join(' ');
    const analyzeMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Review every move in this game.\n\nMoves: ${moves}\nResult: ${result || 'Unknown'}\n\nReturn ONLY valid JSON: an array with one object per move containing ply, moveNumber, color, san, and review. Keep each review under 30 words. No markdown.` },
    ];
    const analyzeOptions = { maxTokens: Math.min(2000, Math.max(600, 120 + sanMoves.length * 30)) };
    let response;
    try {
      response = await callCoach(analyzeMessages, { userId, ...analyzeOptions });
    } catch (coachErr) {
      response = await callCoachFree(analyzeMessages, analyzeOptions);
    }
    const data = await response.json();
    const parsed = extractJson(data.choices?.[0]?.message?.content || '');
    const rawMoves = Array.isArray(parsed?.moves) ? parsed.moves : Array.isArray(parsed) ? parsed : null;
    if (!rawMoves) return res.json({ analysis: data.choices?.[0]?.message?.content || '' });
    return res.json({ analysis: { format: 'move_review', moves: rawMoves.map((entry, index) => ({
      ply: Number.isFinite(entry?.ply) ? entry.ply : index + 1,
      moveNumber: Number.isFinite(entry?.moveNumber) ? entry.moveNumber : Math.floor(index / 2) + 1,
      color: entry?.color === 'black' || index % 2 === 1 ? 'black' : 'white',
      san: entry?.san || sanMoves[index] || '',
      review: entry?.review || entry?.comment || entry?.analysis || '',
    })) } });
  } catch (error) {
    if (error?.status === 402) return res.status(402).json({ error: error.message, code: 'POLLINATIONS_AUTH_REQUIRED' });
    return handleRouteError(res, error, 'Failed to analyze game');
  }
});

export default router;
