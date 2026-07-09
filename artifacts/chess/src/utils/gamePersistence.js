/**
 * Client-side persistence for in-progress games.
 * Survives page refresh / accidental reload for bot (local) and online matches.
 * Server/DB persistence remains the source of truth when available; localStorage
 * is an immediate, offline-capable fallback.
 */

const LOCAL_GAME_PREFIX = 'chess_local_game:';
const LOCAL_ACTIVE_KEY = 'chess_active_local_game_id';
const ONLINE_SESSION_KEY = 'chess_active_online_session';
const ONLINE_GAME_PREFIX = 'chess_online_game:';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('[gamePersistence] Failed to write localStorage:', err);
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isFresh(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!entry.updatedAt) return true;
  return Date.now() - Number(entry.updatedAt) < MAX_AGE_MS;
}

// ─── Local / bot games ───────────────────────────────────────────────────────

export function saveLocalGame(state) {
  if (!state?.gameId) return false;

  const gameId = String(state.gameId).toUpperCase();
  const payload = {
    gameId,
    fen: state.fen || null,
    moveHistory: Array.isArray(state.moveHistory) ? state.moveHistory : [],
    playerColor: state.playerColor || 'w',
    boardOrientation: state.boardOrientation || 'white',
    botId: state.botId || null,
    botName: state.botName || null,
    customElo: state.customElo ?? null,
    hasResigned: Boolean(state.hasResigned),
    result: state.result || 'in_progress',
    updatedAt: Date.now(),
  };

  const ok = safeSet(`${LOCAL_GAME_PREFIX}${gameId}`, JSON.stringify(payload));
  if (ok && payload.result === 'in_progress' && !payload.hasResigned) {
    safeSet(LOCAL_ACTIVE_KEY, gameId);
  }
  return ok;
}

export function loadLocalGame(gameId) {
  if (!gameId) return null;
  const id = String(gameId).toUpperCase();
  const entry = parseJson(safeGet(`${LOCAL_GAME_PREFIX}${id}`));
  if (!entry || !isFresh(entry)) {
    if (entry) clearLocalGame(id);
    return null;
  }
  return entry;
}

export function getActiveLocalGameId() {
  const id = safeGet(LOCAL_ACTIVE_KEY);
  if (!id) return null;
  const entry = loadLocalGame(id);
  if (!entry || entry.result !== 'in_progress' || entry.hasResigned) {
    safeRemove(LOCAL_ACTIVE_KEY);
    return null;
  }
  return id;
}

export function clearLocalGame(gameId) {
  if (!gameId) return;
  const id = String(gameId).toUpperCase();
  safeRemove(`${LOCAL_GAME_PREFIX}${id}`);
  const active = safeGet(LOCAL_ACTIVE_KEY);
  if (active && active.toUpperCase() === id) {
    safeRemove(LOCAL_ACTIVE_KEY);
  }
}

export function markLocalGameFinished(gameId, result = 'completed') {
  if (!gameId) return;
  const existing = loadLocalGame(gameId);
  if (!existing) {
    safeRemove(LOCAL_ACTIVE_KEY);
    return;
  }
  saveLocalGame({ ...existing, result, hasResigned: result === 'resigned' || existing.hasResigned });
  const active = safeGet(LOCAL_ACTIVE_KEY);
  if (active && active.toUpperCase() === String(gameId).toUpperCase()) {
    safeRemove(LOCAL_ACTIVE_KEY);
  }
}

// ─── Online games ────────────────────────────────────────────────────────────

export function saveOnlineSession(session) {
  if (!session?.gameId) return false;

  const payload = {
    gameId: String(session.gameId).toUpperCase(),
    playerId: session.playerId || null,
    playerColor: session.playerColor || null,
    opponentInfo: session.opponentInfo || null,
    updatedAt: Date.now(),
  };

  const ok = safeSet(ONLINE_SESSION_KEY, JSON.stringify(payload));
  if (session.playerId) safeSet('last_chess_player_id', session.playerId);
  if (session.playerColor) safeSet('last_chess_color', session.playerColor);
  return ok;
}

export function loadOnlineSession() {
  const entry = parseJson(safeGet(ONLINE_SESSION_KEY));
  if (!entry || !isFresh(entry)) {
    if (entry) clearOnlineSession();
    return null;
  }
  return entry;
}

export function clearOnlineSession() {
  safeRemove(ONLINE_SESSION_KEY);
}

export function saveOnlineGameState(gameId, state) {
  if (!gameId) return false;
  const id = String(gameId).toUpperCase();
  const payload = {
    gameId: id,
    fen: state.fen || null,
    moveHistory: Array.isArray(state.moveHistory) ? state.moveHistory : [],
    gameStatus: state.gameStatus || 'playing',
    whitePlayer: state.whitePlayer || null,
    blackPlayer: state.blackPlayer || null,
    updatedAt: Date.now(),
  };
  return safeSet(`${ONLINE_GAME_PREFIX}${id}`, JSON.stringify(payload));
}

export function loadOnlineGameState(gameId) {
  if (!gameId) return null;
  const id = String(gameId).toUpperCase();
  const entry = parseJson(safeGet(`${ONLINE_GAME_PREFIX}${id}`));
  if (!entry || !isFresh(entry)) {
    if (entry) safeRemove(`${ONLINE_GAME_PREFIX}${id}`);
    return null;
  }
  return entry;
}

export function clearOnlineGameState(gameId) {
  if (!gameId) return;
  safeRemove(`${ONLINE_GAME_PREFIX}${String(gameId).toUpperCase()}`);
}
