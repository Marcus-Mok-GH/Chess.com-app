import express from 'express';
import { query } from '../db.js';
import crypto from 'crypto';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = express.Router();

// Generate a unique game code
function generateGameCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
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

    if (!result) {
      return errorResponse(res, 400, 'Result is required');
    }

    if (!Array.isArray(moveHistory)) {
      return errorResponse(res, 400, 'Move history must be an array');
    }

    // Use client-provided game code when available (e.g. local games at /game/:gameId)
    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();

    // Determine player positions based on color
    const whiteName = playerColor === 'white' ? username : opponentName;
    const blackName = playerColor === 'black' ? username : opponentName;
    const whiteId = playerColor === 'white' ? userId : null;
    const blackId = playerColor === 'black' ? userId : null;

    const status = result === 'in_progress' ? 'in_progress' : 'completed';

    // Insert or update game in database for autosave support
    const insertResult = await query(
      `INSERT INTO games (
        game_code, 
        white_player_id, 
        black_player_id, 
        white_player_name, 
        black_player_name, 
        result, 
        game_mode, 
        fen, 
        move_history, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (game_code)
      DO UPDATE SET
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
      [
        gameCode,
        whiteId,
        blackId,
        whiteName || 'Unknown',
        blackName || 'Bot',
        result,
        gameMode,
        finalFen || null,
        moveHistory,
        status
      ]
    );

    console.log(`[Games] Game saved - code: ${gameCode}, mode: ${gameMode}, result: ${result}, moves: ${moveHistory.length}`);

    res.json({
      success: true,
      message: 'Game saved successfully',
      gameId: insertResult.rows[0].id,
      gameCode: insertResult.rows[0].game_code
    });
  } catch (error) {
    console.error('Save game error:', error);
    return handleRouteError(res, error, 'Failed to save game');
  }
});

// Create a local game placeholder to enable cross-device resume
router.post('/local/create', async (req, res) => {
  try {
    const {
      gameCode: requestedGameCode,
      userId,
      username,
      opponentName = 'Bot',
      opponentElo,
      playerColor = 'white',
    } = req.body;

    if (!username) {
      return errorResponse(res, 400, 'Username is required');
    }

    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();

    const whiteName = playerColor === 'white' ? username : opponentName;
    const blackName = playerColor === 'black' ? username : opponentName;
    const whiteId = playerColor === 'white' ? userId : null;
    const blackId = playerColor === 'black' ? userId : null;

    await query(
      `INSERT INTO games (
        game_code,
        white_player_id,
        black_player_id,
        white_player_name,
        black_player_name,
        result,
        game_mode,
        fen,
        move_history,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (game_code)
      DO UPDATE SET
        white_player_id = EXCLUDED.white_player_id,
        black_player_id = EXCLUDED.black_player_id,
        white_player_name = EXCLUDED.white_player_name,
        black_player_name = EXCLUDED.black_player_name,
        result = EXCLUDED.result,
        game_mode = EXCLUDED.game_mode,
        fen = EXCLUDED.fen,
        move_history = EXCLUDED.move_history,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        gameCode,
        whiteId,
        blackId,
        whiteName || 'Unknown',
        blackName || 'Bot',
        'in_progress',
        'local',
        null,
        [],
        'in_progress'
      ]
    );

    res.json({ success: true, gameCode });
  } catch (error) {
    console.error('Create local game error:', error);
    return handleRouteError(res, error, 'Failed to create local game');
  }
});

// Get local game by code for a specific user
router.get('/local/:username/:gameCode', async (req, res) => {
  try {
    const { username, gameCode } = req.params;

    if (!username || !gameCode) {
      return errorResponse(res, 400, 'Username and game code are required');
    }

    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at
       FROM games
       WHERE game_code = $1
         AND game_mode = 'local'
         AND (white_player_name = $2 OR black_player_name = $2)
       LIMIT 1`,
      [gameCode.toUpperCase(), username]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Game not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get local game error:', error);
    return handleRouteError(res, error, 'Failed to get local game');
  }
});

// Create a friendly online game (local storage replacement)
router.post('/online/create', async (req, res) => {
  try {
    const { gameCode: requestedGameCode, playerId, playerName, playerColor = 'white', playerElo } = req.body;

    if (!playerId || !playerName) {
      return errorResponse(res, 400, 'Player id and name are required');
    }

    const gameCode = (requestedGameCode || generateGameCode()).toString().toUpperCase();
    const isWhite = playerColor === 'white';

    await query(
      `INSERT INTO active_games (
        game_id,
        white_player_id,
        black_player_id,
        white_player_name,
        black_player_name,
        white_elo,
        black_elo,
        status,
        game_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (game_id)
      DO UPDATE SET
        white_player_id = EXCLUDED.white_player_id,
        black_player_id = EXCLUDED.black_player_id,
        white_player_name = EXCLUDED.white_player_name,
        black_player_name = EXCLUDED.black_player_name,
        white_elo = EXCLUDED.white_elo,
        black_elo = EXCLUDED.black_elo,
        status = EXCLUDED.status,
        game_mode = EXCLUDED.game_mode,
        updated_at = CURRENT_TIMESTAMP`,
      [
        gameCode,
        isWhite ? playerId : null,
        isWhite ? null : playerId,
        isWhite ? playerName : null,
        isWhite ? null : playerName,
        isWhite ? playerElo || null : null,
        isWhite ? null : playerElo || null,
        'waiting',
        'friendly'
      ]
    );

    res.json({ success: true, gameCode, playerColor });
  } catch (error) {
    console.error('Create online game error:', error);
    return handleRouteError(res, error, 'Failed to create online game');
  }
});

// Join a friendly online game
router.post('/online/join', async (req, res) => {
  try {
    const { gameCode, playerId, playerName, playerElo } = req.body;

    if (!gameCode || !playerId || !playerName) {
      return errorResponse(res, 400, 'Game code, player id, and name are required');
    }

    const existing = await query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameCode.toUpperCase()]
    );

    if (existing.rows.length === 0) {
      return errorResponse(res, 404, 'Game not found');
    }

    const game = existing.rows[0];

    if (game.status !== 'waiting') {
      return errorResponse(res, 400, 'Game already started or ended');
    }

    const isWhiteOpen = !game.white_player_id;
    const assignedColor = isWhiteOpen ? 'white' : 'black';

    await query(
      `UPDATE active_games
       SET white_player_id = COALESCE(white_player_id, $2),
           black_player_id = COALESCE(black_player_id, $3),
           white_player_name = COALESCE(white_player_name, $4),
           black_player_name = COALESCE(black_player_name, $5),
           white_elo = COALESCE(white_elo, $6),
           black_elo = COALESCE(black_elo, $7),
           status = 'playing',
           updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1`,
      [
        gameCode.toUpperCase(),
        isWhiteOpen ? playerId : null,
        isWhiteOpen ? null : playerId,
        isWhiteOpen ? playerName : null,
        isWhiteOpen ? null : playerName,
        isWhiteOpen ? playerElo || null : null,
        isWhiteOpen ? null : playerElo || null,
      ]
    );

    res.json({
      success: true,
      gameCode: gameCode.toUpperCase(),
      playerColor: assignedColor,
    });
  } catch (error) {
    console.error('Join online game error:', error);
    return handleRouteError(res, error, 'Failed to join online game');
  }
});

// Leave a friendly online game
router.post('/online/leave', async (req, res) => {
  try {
    const { gameCode, playerId } = req.body;

    if (!gameCode || !playerId) {
      return errorResponse(res, 400, 'Game code and player id are required');
    }

    await query(
      `UPDATE active_games
       SET status = 'ended', updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1 AND (white_player_id = $2 OR black_player_id = $2)`,
      [gameCode.toUpperCase(), playerId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Leave online game error:', error);
    return handleRouteError(res, error, 'Failed to leave online game');
  }
});

// Get game history
router.get('/history/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    // Get games for the user
    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at
       FROM games
       WHERE white_player_name = $1 OR black_player_name = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [username, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get game history error:', error);
    return handleRouteError(res, error, 'Failed to get game history');
  }
});

// Get per-user move history for a match
router.get('/match-moves/:gameId/:username', async (req, res) => {
  try {
    const { gameId, username } = req.params;

    if (!gameId || !username) {
      return errorResponse(res, 400, 'Game ID and username are required');
    }

    const normalizedGameId = gameId.trim().toUpperCase();
    const normalizedUsername = username.trim();

    const result = await query(
      `SELECT game_id, username, move_history, updated_at
       FROM match_moves
       WHERE game_id = $1 AND LOWER(username) = LOWER($2)
       LIMIT 1`,
      [normalizedGameId, normalizedUsername]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Match moves not found');
    }

    const row = result.rows[0];
    return res.json({
      gameId: row.game_id,
      username: row.username,
      moveHistory: row.move_history || [],
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get match moves error:', error);
    return handleRouteError(res, error, 'Failed to get match moves');
  }
});

// Get game by code
router.get('/by-code/:gameCode', async (req, res) => {
  try {
    const { gameCode } = req.params;

    if (!gameCode) {
      return errorResponse(res, 400, 'Game code is required');
    }

    const result = await query(
      `SELECT game_code, result, fen, move_history, game_mode, created_at
       FROM games
       WHERE game_code = $1
       LIMIT 1`,
      [gameCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Game not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get game by code error:', error);
    return handleRouteError(res, error, 'Failed to get game');
  }
});

export default router;
