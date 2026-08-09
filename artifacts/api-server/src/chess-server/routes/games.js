import express from 'express';
import { query } from '../db.js';
import { getPool } from '../db/pool.js';
import crypto from 'crypto';
import { Chess } from 'chess.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { userIdFromPlayerId } from '../socket/utils.js';
import { validateSession } from '../auth.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';

const router = express.Router();

function getStoredMove(entry) {
  if (entry && typeof entry === 'object') return entry;
  if (typeof entry !== 'string') return null;
  const trimmed = entry.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }
  return trimmed;
}

function replayStoredHistory(moveHistory) {
  if (!Array.isArray(moveHistory)) return null;
  const replay = new Chess();
  try {
    for (const entry of moveHistory) {
      const move = getStoredMove(entry);
      if (!move || !replay.move(move)) return null;
    }
    return replay;
  } catch {
    return null;
  }
}

// Generate a unique game code
function generateGameCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Compute and apply ELO rating changes for a completed game.
 *
 * This is the ONLY place ELO is mutated. The standalone
 * POST /api/users/:username/elo endpoint has been removed to prevent
 * unauthenticated rating manipulation.
 *
 * An idempotency guard on elo_history(user_id, game_code) ensures autosave retries
 * and duplicate requests don't double-count a game. The unique constraint and
 * ON CONFLICT DO NOTHING make the insert atomic, preventing race conditions.
 */
async function computeAndApplyElo(userId, gameCode, gameResult, opponentElo, gameMode) {
  if (!['win', 'loss', 'draw'].includes(gameResult)) return;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, elo, games_played, wins, losses, draws FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    const user = userResult.rows[0];
    const K = 32;
    const oppElo = typeof opponentElo === 'number' ? opponentElo : 1200;
    const expected = 1 / (1 + Math.pow(10, (oppElo - user.elo) / 400));
    const actual = gameResult === 'win' ? 1 : gameResult === 'draw' ? 0.5 : 0;
    const newElo = Math.round(user.elo + K * (actual - expected));

    const wins   = user.wins   + (gameResult === 'win'  ? 1 : 0);
    const losses = user.losses + (gameResult === 'loss' ? 1 : 0);
    const draws  = user.draws  + (gameResult === 'draw' ? 1 : 0);
    const played = user.games_played + 1;

    const historyInsert = await client.query(
      `INSERT INTO elo_history (user_id, elo, change, game_code, game_mode, opponent_elo, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, game_code) DO NOTHING
       RETURNING id`,
      [user.id, newElo, newElo - user.elo, gameCode, gameMode, oppElo, gameResult]
    );

    if (historyInsert.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE users
       SET elo = $1, games_played = $2, wins = $3, losses = $4, draws = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [newElo, played, wins, losses, draws, user.id]
    );

    await client.query('COMMIT');
    console.log(`[ELO] ${user.id} ${user.elo} → ${newElo} (${gameResult}, game ${gameCode})`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Save game result
router.post('/save', async (req, res) => {
  try {
    const {
      gameMode = 'local',
      userId,
      username,
      result,
      moveHistory = [],
      opponentName = 'Bot',
      opponentElo,
      playerColor = 'white',
      finalFen,
      gameCode: requestedGameCode,
    } = req.body;

    if (!result) return errorResponse(res, 400, 'Result is required');
    if (!Array.isArray(moveHistory)) return errorResponse(res, 400, 'Move history must be an array');

    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();
    const whiteName = playerColor === 'white' ? username : opponentName;
    const blackName = playerColor === 'black' ? username : opponentName;
    const whiteId = playerColor === 'white' ? userId : null;
    const blackId = playerColor === 'black' ? userId : null;
    const status = result === 'in_progress' ? 'in_progress' : 'completed';

    const insertResult = await query(
      `INSERT INTO games (
        game_code, white_player_id, black_player_id, white_player_name,
        black_player_name, result, game_mode, fen, move_history, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (game_code) DO UPDATE SET
        white_player_id = EXCLUDED.white_player_id,
        black_player_id = EXCLUDED.black_player_id,
        white_player_name = EXCLUDED.white_player_name,
        black_player_name = EXCLUDED.black_player_name,
        result = EXCLUDED.result,
        game_mode = EXCLUDED.game_mode,
        fen = EXCLUDED.fen,
        move_history = EXCLUDED.move_history,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, game_code, created_at`,
      [gameCode, whiteId, blackId, whiteName || 'Unknown', blackName || 'Bot',
       result, gameMode, finalFen || null, moveHistory, status]
    );

    console.log(`[Games] saved – code: ${gameCode}, mode: ${gameMode}, result: ${result}`);

    if (status === 'completed' && userId && ['win', 'loss', 'draw'].includes(result)) {
      try {
        await computeAndApplyElo(userId, gameCode, result, opponentElo ?? null, gameMode);
      } catch (eloErr) {
        console.error('[ELO] Update failed (non-fatal):', eloErr?.message);
      }
    }

    res.json({
      success: true,
      message: 'Game saved successfully',
      gameId: insertResult.rows[0].id,
      gameCode: insertResult.rows[0].game_code,
    });
  } catch (error) {
    console.error('Save game error:', error);
    return handleRouteError(res, error, 'Failed to save game');
  }
});

// Create a local game placeholder
router.post('/local/create', async (req, res) => {
  try {
    const { gameCode: requestedGameCode, userId, username, opponentName = 'Bot',
            opponentElo, playerColor = 'white' } = req.body;

    if (!username) return errorResponse(res, 400, 'Username is required');

    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();
    const whiteName = playerColor === 'white' ? username : opponentName;
    const blackName = playerColor === 'black' ? username : opponentName;
    const whiteId = playerColor === 'white' ? userId : null;
    const blackId = playerColor === 'black' ? userId : null;

    await query(
      `INSERT INTO games (
        game_code, white_player_id, black_player_id, white_player_name,
        black_player_name, result, game_mode, fen, move_history, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (game_code) DO UPDATE SET
        white_player_id = EXCLUDED.white_player_id,
        black_player_id = EXCLUDED.black_player_id,
        white_player_name = EXCLUDED.white_player_name,
        black_player_name = EXCLUDED.black_player_name,
        result = EXCLUDED.result, game_mode = EXCLUDED.game_mode,
        fen = EXCLUDED.fen, move_history = EXCLUDED.move_history,
        status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
      [gameCode, whiteId, blackId, whiteName || 'Unknown', blackName || 'Bot',
       'in_progress', 'local', null, [], 'in_progress']
    );

    res.json({ success: true, gameCode });
  } catch (error) {
    console.error('Create local game error:', error);
    return handleRouteError(res, error, 'Failed to create local game');
  }
});

router.get('/local/latest/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return errorResponse(res, 400, 'Username is required');

    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at, updated_at,
              white_player_name, black_player_name
       FROM games
       WHERE game_mode = 'local'
         AND result = 'in_progress'
         AND (LOWER(white_player_name) = LOWER($1) OR LOWER(black_player_name) = LOWER($1))
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [username]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get latest incomplete local game');
  }
});

// Get local game by code for a specific user
router.get('/local/:username/:gameCode', async (req, res) => {
  try {
    const { username, gameCode } = req.params;
    if (!username || !gameCode) return errorResponse(res, 400, 'Username and game code are required');

    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at
       FROM games
       WHERE game_code = $1 AND game_mode = 'local'
         AND (white_player_name = $2 OR black_player_name = $2)
       LIMIT 1`,
      [gameCode.toUpperCase(), username]
    );

    if (result.rows.length === 0) return errorResponse(res, 404, 'Game not found');
    res.json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get local game');
  }
});

// Create a friendly online game
router.post('/online/create', async (req, res) => {
  try {
    const { gameCode: requestedGameCode, playerId, playerName,
            playerColor = 'white', playerElo } = req.body;
    if (!playerId || !playerName) return errorResponse(res, 400, 'Player id and name are required');
    if (!['white', 'black'].includes(playerColor)) return errorResponse(res, 400, 'Invalid player color');
    if (playerElo != null && (!Number.isFinite(playerElo) || playerElo < 0 || playerElo > 4000)) {
      return errorResponse(res, 400, 'Invalid player ELO');
    }

    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();
    const isWhite = playerColor === 'white';

    await query(
      `INSERT INTO active_games (
        game_id, white_player_id, black_player_id, white_player_name,
        black_player_name, white_elo, black_elo, status, game_mode
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (game_id) DO UPDATE SET
        white_player_id = EXCLUDED.white_player_id,
        black_player_id = EXCLUDED.black_player_id,
        white_player_name = EXCLUDED.white_player_name,
        black_player_name = EXCLUDED.black_player_name,
        white_elo = EXCLUDED.white_elo, black_elo = EXCLUDED.black_elo,
        status = EXCLUDED.status, game_mode = EXCLUDED.game_mode,
        updated_at = CURRENT_TIMESTAMP`,
      [gameCode, isWhite ? playerId : null, isWhite ? null : playerId,
       isWhite ? playerName : null, isWhite ? null : playerName,
       isWhite ? playerElo || null : null, isWhite ? null : playerElo || null,
       'waiting', 'friendly']
    );
    const kv = getOnlineGameKv();
    await kv.set(gameCode, {
      game_id: gameCode, game_code: gameCode,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move_history: [], move_count: 0, status: 'waiting', game_mode: 'friendly',
      white_player_id: isWhite ? playerId : null, black_player_id: isWhite ? null : playerId,
      white_player_name: isWhite ? playerName : null, black_player_name: isWhite ? null : playerName,
      white_elo: isWhite ? playerElo || null : null, black_elo: isWhite ? null : playerElo || null,
    });

    res.json({ success: true, gameCode, playerColor });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to create online game');
  }
});

// Join a friendly online game
router.post('/online/join', async (req, res) => {
  try {
    const { gameCode, playerId, playerName, playerElo } = req.body;
    if (!gameCode || !playerId || !playerName)
      return errorResponse(res, 400, 'Game code, player id, and name are required');
    if (playerElo != null && (!Number.isFinite(playerElo) || playerElo < 0 || playerElo > 4000)) {
      return errorResponse(res, 400, 'Invalid player ELO');
    }

    const existing = await query('SELECT * FROM active_games WHERE game_id = $1',
      [gameCode.toUpperCase()]);
    if (existing.rows.length === 0) return errorResponse(res, 404, 'Game not found');

    const game = existing.rows[0];
    if (game.status !== 'waiting') return errorResponse(res, 400, 'Game already started or ended');
    if (game.white_player_id === playerId || game.black_player_id === playerId) {
      return errorResponse(res, 409, 'You are already assigned to this game');
    }

    const isWhiteOpen = !game.white_player_id;
    const assignedColor = isWhiteOpen ? 'white' : 'black';
    const updated = await query(
      `UPDATE active_games
       SET white_player_id = COALESCE(white_player_id, $2),
           black_player_id = COALESCE(black_player_id, $3),
           white_player_name = COALESCE(white_player_name, $4),
           black_player_name = COALESCE(black_player_name, $5),
           white_elo = COALESCE(white_elo, $6),
           black_elo = COALESCE(black_elo, $7),
           status = 'playing', updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1 AND status = 'waiting'
         AND ((white_player_id IS NULL AND black_player_id IS NOT NULL)
           OR (white_player_id IS NOT NULL AND black_player_id IS NULL))
      RETURNING *`,
      [gameCode.toUpperCase(),
       isWhiteOpen ? playerId : null, isWhiteOpen ? null : playerId,
       isWhiteOpen ? playerName : null, isWhiteOpen ? null : playerName,
       isWhiteOpen ? playerElo || null : null, isWhiteOpen ? null : playerElo || null]
    );
    if (!updated.rows[0]) return errorResponse(res, 409, 'Game was joined by another player');

    const kv = getOnlineGameKv();
    await kv.set(gameCode.toUpperCase(), {
      game_id: gameCode.toUpperCase(), game_code: gameCode.toUpperCase(),
      fen: game.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move_history: game.move_history || [], move_count: game.move_count || 0,
      status: 'playing', game_mode: game.game_mode || 'friendly',
      white_player_id: isWhiteOpen ? playerId : game.white_player_id,
      black_player_id: isWhiteOpen ? game.black_player_id : playerId,
      white_player_name: isWhiteOpen ? playerName : game.white_player_name,
      black_player_name: isWhiteOpen ? game.black_player_name : playerName,
      white_elo: isWhiteOpen ? playerElo || null : game.white_elo,
      black_elo: isWhiteOpen ? game.black_elo : playerElo || null,
    });

    res.json({ success: true, gameCode: gameCode.toUpperCase(), playerColor: assignedColor });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to join online game');
  }
});

// Leave a friendly online game
router.post('/online/leave', async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;
    if (!gameCode || !playerId) return errorResponse(res, 400, 'Game code and player id are required');
    await query(
      `UPDATE active_games SET status = 'ended', updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1 AND (white_player_id = $2 OR black_player_id = $2)`,
      [gameCode.toUpperCase(), playerId]
    );

    const kv = getOnlineGameKv();
    await kv.del(gameCode.toUpperCase());

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to leave online game');
  }
});

// Get game history
router.get('/history/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 20, 100));
    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at
       FROM games
       WHERE white_player_id = $1
          OR black_player_id = $1
          OR LOWER(white_player_name) = LOWER($1)
          OR LOWER(black_player_name) = LOWER($1)
          OR white_player_id IN (SELECT id FROM users WHERE LOWER(username) = LOWER($1))
          OR black_player_id IN (SELECT id FROM users WHERE LOWER(username) = LOWER($1))
       ORDER BY created_at DESC LIMIT $2`,
      [username, limit]
    );
    res.json(result.rows);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get game history');
  }
});

// Get per-user move history for a match
router.get('/match-moves/:gameId/:username', async (req, res) => {
  try {
    const { gameId, username } = req.params;
    if (!gameId || !username) return errorResponse(res, 400, 'Game ID and username are required');

    const result = await query(
      `SELECT game_id, username, move_history, updated_at
       FROM match_moves
       WHERE game_id = $1 AND LOWER(username) = LOWER($2)
       LIMIT 1`,
      [gameId.trim().toUpperCase(), username.trim()]
    );
    if (result.rows.length === 0) return errorResponse(res, 404, 'Match moves not found');

    const row = result.rows[0];
    return res.json({ gameId: row.game_id, username: row.username,
      moveHistory: row.move_history || [], updatedAt: row.updated_at });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get match moves');
  }
});

// Normalize a raw DB row or KV state into a consistent response shape
// so clients always receive the same fields regardless of source.
function normalizeGameResponse(row) {
  if (!row) return null;
  const move_history = Array.isArray(row.move_history)
    ? row.move_history
    : [];
  return {
    game_id: row.game_id || row.game_code || null,
    game_code: row.game_code || row.game_id || null,
    fen: row.fen || null,
    move_history,
    move_count: typeof row.move_count === 'number' ? row.move_count : move_history.length,
    status: row.status || 'unknown',
    game_mode: row.game_mode || 'friendly',
    white_player_id: row.white_player_id || null,
    black_player_id: row.black_player_id || null,
    white_player_name: row.white_player_name || null,
    black_player_name: row.black_player_name || null,
    white_elo: typeof row.white_elo === 'number' ? row.white_elo : null,
    black_elo: typeof row.black_elo === 'number' ? row.black_elo : null,
    result: row.result || null,
    created_at: row.created_at || null,
  };
}

// Get game by code — query active_games first; KV serves as fast-path when at
// least as new, otherwise DB is authoritative and repopulates KV.
// DB errors fall back to KV as degraded mode.
router.get('/by-code/:gameCode', async (req, res) => {
  try {
    const { gameCode } = req.params;
    if (!gameCode) return errorResponse(res, 400, 'Game code is required');

    const normalizedCode = gameCode.toUpperCase();
    const kv = getOnlineGameKv();

    const kvState = await kv.get(normalizedCode);

    let dbRow = null;
    try {
      const activeResult = await query(
        `SELECT game_id AS game_code, result, fen, move_history,
                game_mode, status, created_at,
                white_player_id, black_player_id,
                white_player_name, black_player_name,
                white_elo, black_elo, move_count
         FROM active_games WHERE game_id = $1 LIMIT 1`,
        [normalizedCode]
      );
      if (activeResult.rows.length > 0) {
        dbRow = activeResult.rows[0];
      }
    } catch (dbErr) {
      console.error('[Games] active_games query failed (non-fatal):', dbErr?.message);
      if (kvState) return res.json(normalizeGameResponse(kvState));
      return handleRouteError(res, dbErr, 'Failed to get game');
    }

    if (dbRow) {
      if (kvState && typeof kvState.move_count === 'number' && typeof dbRow.move_count === 'number') {
        if (kvState.status !== dbRow.status) {
          await kv.set(normalizedCode, dbRow);
          return res.json(normalizeGameResponse(dbRow));
        }
        if (kvState.move_count >= dbRow.move_count) {
          return res.json(normalizeGameResponse(kvState));
        }
        await kv.set(normalizedCode, dbRow);
        return res.json(normalizeGameResponse(dbRow));
      }
      await kv.set(normalizedCode, dbRow);
      return res.json(normalizeGameResponse(dbRow));
    }

    let completedRow = null;
    try {
      const result = await query(
        `SELECT game_code, result, fen, move_history, game_mode, status, created_at,
                white_player_id, black_player_id, white_player_name, black_player_name
         FROM games WHERE game_code = $1 LIMIT 1`,
        [normalizedCode]
      );
      if (result.rows.length > 0) {
        completedRow = result.rows[0];
      }
    } catch (gameErr) {
      console.error('[Games] games query failed (non-fatal):', gameErr?.message);
      if (kvState) return res.json(normalizeGameResponse(kvState));
      return handleRouteError(res, gameErr, 'Failed to get game');
    }

    if (completedRow) return res.json(normalizeGameResponse(completedRow));

    if (kvState) return res.json(normalizeGameResponse(kvState));
    return errorResponse(res, 404, 'Game not found');
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get game');
  }
});

// Server-authoritative move endpoint for online games.
// Accepts only the attempted move + player identity + expected move_count.
// Validates with chess.js from stored FEN, atomically compare-and-set updates.
router.post('/:gameId/move', async (req, res) => {
  try {
    const gameId = (req.params.gameId || '').toUpperCase();
    const { move, playerId, expectedMoveCount } = req.body;

    if (!gameId || typeof gameId !== 'string' || gameId.length < 2) {
      return errorResponse(res, 400, 'Invalid game ID');
    }
    if (!playerId || typeof playerId !== 'string') {
      return errorResponse(res, 400, 'Invalid player ID');
    }
    if (!move || typeof move !== 'object') {
      return errorResponse(res, 400, 'Invalid move payload');
    }
    if (typeof expectedMoveCount !== 'number') {
      return errorResponse(res, 400, 'Invalid expected move count');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const token = authHeader.slice(7).trim();
    const authUserId = await validateSession(token);
    if (!authUserId) {
      return errorResponse(res, 401, 'Invalid or expired session');
    }
    const requestUid = userIdFromPlayerId(playerId);
    if (requestUid == null || String(authUserId) !== String(requestUid)) {
      return errorResponse(res, 403, 'Session identity does not match player');
    }

    const activeResult = await query(
      `SELECT * FROM active_games WHERE game_id = $1`,
      [gameId]
    );
    const game = activeResult.rows[0];

    if (!game || game.status !== 'playing') {
      return errorResponse(res, 404, 'Game not found or not active');
    }

    const whiteUid = userIdFromPlayerId(game.white_player_id);
    const blackUid = userIdFromPlayerId(game.black_player_id);
    const isWhite = requestUid != null && whiteUid != null && requestUid === whiteUid;
    const isBlack = requestUid != null && blackUid != null && requestUid === blackUid;
    if (!isWhite && !isBlack) {
      return errorResponse(res, 403, 'Unauthorized — not your game');
    }

    const activeColor = game.fen && typeof game.fen === 'string'
      ? game.fen.trim().split(/\s+/)[1]
      : 'w';
    const expectedColor = activeColor === 'w' ? 'white' : 'black';
    if ((isWhite ? 'white' : 'black') !== expectedColor) {
      return errorResponse(res, 409, 'Not your turn');
    }

    const serverMoveCount = Number.isInteger(game.move_count)
      ? game.move_count
      : (Array.isArray(game.move_history) ? game.move_history.length : 0);
    if (expectedMoveCount !== serverMoveCount) {
      return errorResponse(res, 409, 'Stale move: state changed since you last saw it');
    }

    let chess;
    try {
      chess = new Chess(game.fen);
    } catch {
      return errorResponse(res, 500, 'Server game state invalid');
    }

    let applied;
    try {
      const moveSpec = (move.from && move.to)
        ? { from: move.from, to: move.to, promotion: move.promotion || 'q' }
        : (move.san || move);
      applied = chess.move(moveSpec);
    } catch {
      applied = null;
    }
    if (!applied) {
      return errorResponse(res, 422, 'Illegal move');
    }

    const newHistory = Array.isArray(game.move_history)
      ? [...game.move_history, JSON.stringify({ san: applied.san, from: applied.from, to: applied.to, promotion: applied.promotion, captured: applied.captured || null, color: applied.color, piece: applied.piece })]
      : [JSON.stringify({ san: applied.san, from: applied.from, to: applied.to, promotion: applied.promotion, captured: applied.captured || null, color: applied.color, piece: applied.piece })];

    const casResult = await query(
      `UPDATE active_games
       SET fen = $1, move_history = $2, move_count = move_count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $3 AND move_count = $4 AND status = 'playing'
       RETURNING *`,
      [chess.fen(), newHistory, gameId, serverMoveCount]
    );

    if (!casResult?.rows?.[0]) {
      return errorResponse(res, 409, 'Stale move: concurrent state change');
    }

    const updatedGame = casResult.rows[0];

    // Persist snapshot to games table
    try {
      const whiteUserId = userIdFromPlayerId(game.white_player_id);
      const blackUserId = userIdFromPlayerId(game.black_player_id);
      await query(
        `INSERT INTO games (
          game_code, white_player_id, black_player_id,
          white_player_name, black_player_name,
          fen, move_history, status, game_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (game_code)
        DO UPDATE SET
          fen = EXCLUDED.fen, move_history = EXCLUDED.move_history,
          status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
        [gameId, whiteUserId, blackUserId,
         game.white_player_name, game.black_player_name,
         chess.fen(), newHistory, game.status, game.game_mode]
      );
    } catch (snapErr) {
      console.error('[Games] Persist snapshot failed (non-fatal):', snapErr?.message);
    }

    console.log(`[Games] HTTP move in ${gameId} by ${playerId} (count ${serverMoveCount} → ${serverMoveCount + 1})`);

    const kv = getOnlineGameKv();
    await kv.set(gameId, {
      game_id: gameId, game_code: gameId,
      fen: chess.fen(), move_history: newHistory,
      move_count: serverMoveCount + 1,
      status: updatedGame.status || game.status,
      game_mode: game.game_mode,
      white_player_id: game.white_player_id,
      black_player_id: game.black_player_id,
      white_player_name: game.white_player_name,
      black_player_name: game.black_player_name,
      white_elo: game.white_elo,
      black_elo: game.black_elo,
    });

    return res.json({
      success: true,
      fen: chess.fen(),
      moveCount: serverMoveCount + 1,
      moveHistory: newHistory,
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to submit move');
  }
});


router.post('/:gameId/end', async (req, res) => {
  try {
    const gameId = (req.params.gameId || '').toUpperCase();
    const { result, reason, playerId } = req.body;
    if (!gameId || !playerId || !['white', 'black', 'draw'].includes(result)) {
      return errorResponse(res, 400, 'Invalid game result payload');
    }
    if (!['checkmate', 'stalemate', 'draw', 'resignation', 'agreement', 'threefold_repetition', 'fivefold_repetition', 'insufficient_material', 'fifty_moves', 'seventyfive_moves'].includes(reason)) {
      return errorResponse(res, 400, 'Invalid game end reason');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return errorResponse(res, 401, 'Authentication required');
    const authUserId = await validateSession(authHeader.slice(7).trim());
    const requestUid = userIdFromPlayerId(playerId);
    if (authUserId == null || requestUid == null || String(authUserId) != String(requestUid)) {
      return errorResponse(res, 403, 'Session identity does not match player');
    }
    if (reason === 'draw' || reason === 'agreement') {
      return errorResponse(res, 400, 'Use the socket draw flow for agreed draws');
    }

    const activeResult = await query('SELECT * FROM active_games WHERE game_id = $1', [gameId]);
    const game = activeResult.rows[0];
    if (!game) return errorResponse(res, 404, 'Game not found');

    const isWhite = userIdFromPlayerId(game.white_player_id) === requestUid;
    const isBlack = userIdFromPlayerId(game.black_player_id) === requestUid;
    if (!isWhite && !isBlack) return errorResponse(res, 403, 'Unauthorized — not your game');

    if (game.status === 'ended') {
      return res.json({ success: true, status: 'ended', result: game.result || null, alreadyEnded: true });
    }
    if (game.status !== 'playing') return errorResponse(res, 409, 'Game is not active');

    let chess;
    try { chess = new Chess(game.fen); } catch { return errorResponse(res, 500, 'Server game state invalid'); }

    if (reason === 'checkmate') {
      const winner = chess.turn() === 'w' ? 'black' : 'white';
      if (!chess.isCheckmate() || result !== winner) return errorResponse(res, 422, 'Invalid checkmate result');
    }
    if (reason === 'stalemate' && (!chess.isStalemate() || result !== 'draw')) {
      return errorResponse(res, 422, 'Invalid stalemate result');
    }
    if (reason === 'insufficient_material' && (!chess.isInsufficientMaterial() || result !== 'draw')) {
      return errorResponse(res, 422, 'Invalid insufficient-material result');
    }
    if (reason === 'threefold_repetition') {
      const replay = replayStoredHistory(game.move_history);
      if (!replay || replay.fen() !== game.fen || !replay.isThreefoldRepetition() || result !== 'draw') {
        return errorResponse(res, 422, 'Invalid threefold-repetition result');
      }
    }
    if (reason === 'fifty_moves' && (!chess.isDrawByFiftyMoves() || result !== 'draw')) {
      return errorResponse(res, 422, 'Invalid fifty-move result');
    }
    if (reason === 'seventyfive_moves') {
      const halfmoveClock = Number(chess.fen().split(/\s+/)[4]);
      if (!Number.isInteger(halfmoveClock) || halfmoveClock < 150 || result !== 'draw') {
        return errorResponse(res, 422, 'Invalid seventy-five-move result');
      }
    }
    if (reason === 'fivefold_repetition') {
      const replay = replayStoredHistory(game.move_history);
      if (!replay || replay.fen() !== game.fen || !replay.isFivefoldRepetition?.() || result !== 'draw') {
        return errorResponse(res, 422, 'Invalid fivefold-repetition result');
      }
    }
    if (reason === 'resignation') {
      const winner = isWhite ? 'black' : 'white';
      if (result !== winner) return errorResponse(res, 422, 'Invalid resignation result');
    }

    const updated = await query(
      `UPDATE active_games SET status = 'ended', result = $2, updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1 AND status = 'playing' RETURNING *`,
      [gameId, result]
    );
    if (!updated?.rows?.[0]) {
      const current = await query('SELECT status, result FROM active_games WHERE game_id = $1', [gameId]);
      return res.json({ success: true, status: current?.rows?.[0]?.status || 'ended', result: current?.rows?.[0]?.result || null, alreadyEnded: true });
    }

    const finished = updated.rows[0];
    await query(
      `INSERT INTO games (
        game_code, white_player_id, black_player_id, white_player_name, black_player_name,
        result, fen, move_history, status, game_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9)
      ON CONFLICT (game_code) DO UPDATE SET
        result = EXCLUDED.result, fen = EXCLUDED.fen, move_history = EXCLUDED.move_history,
        status = 'completed', updated_at = CURRENT_TIMESTAMP`,
      [gameId, userIdFromPlayerId(finished.white_player_id), userIdFromPlayerId(finished.black_player_id),
       finished.white_player_name, finished.black_player_name, result, finished.fen,
       finished.move_history || [], finished.game_mode]
    );
    await getOnlineGameKv().del(gameId);
    return res.json({ success: true, status: 'ended', result, alreadyEnded: false });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to end game');
  }
});

export default router;