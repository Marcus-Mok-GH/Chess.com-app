import express from 'express';
import { query } from '../db.js';
import { handleRouteError } from '../middleware/errors.js';

const router = express.Router();

// Get queue status
router.get('/status', async (req, res) => {
  try {
    const result = await query('SELECT COUNT(*) as count FROM matchmaking_queue');
    res.json({ playersInQueue: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    handleRouteError(res, error, 'Failed to get queue status');
  }
});

// Get queue details
router.get('/details', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE elo < 1000) as below_1000,
        COUNT(*) FILTER (WHERE elo BETWEEN 1000 AND 1500) as range_1000_1500,
        COUNT(*) FILTER (WHERE elo BETWEEN 1500 AND 2000) as range_1500_2000,
        COUNT(*) FILTER (WHERE elo >= 2000) as above_2000
      FROM matchmaking_queue
    `);

    res.json({
      total: parseInt(result.rows[0].total, 10),
      distribution: {
        below_1000: parseInt(result.rows[0].below_1000, 10),
        range_1000_1500: parseInt(result.rows[0].range_1000_1500, 10),
        range_1500_2000: parseInt(result.rows[0].range_1500_2000, 10),
        above_2000: parseInt(result.rows[0].above_2000, 10)
      }
    });
  } catch (error) {
    handleRouteError(res, error, 'Failed to get queue details');
  }
});

// Join matchmaking queue (polling-based)
router.post('/join', async (req, res) => {
  try {
    const { playerId, playerName, elo, isRanked } = req.body;

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid player ID' });
    }

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid player name' });
    }

    const trimmedName = playerName.trim();

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
      return res.status(400).json({ success: false, message: 'Player name can only contain letters, numbers, and underscores' });
    }

    if (typeof elo !== 'number' || elo < 0 || elo > 4000) {
      return res.status(400).json({ success: false, message: 'Invalid ELO rating' });
    }

    const isRankedValue = typeof isRanked === 'boolean' ? isRanked : true;

    // Check for existing active games
    const existingGame = await query(
      `SELECT game_id FROM active_games
       WHERE (white_player_id = $1 OR black_player_id = $1)
       AND status IN ('playing', 'waiting')
       LIMIT 1`,
      [playerId]
    );

    if (existingGame.rowCount > 0) {
      return res.status(409).json({ success: false, message: 'You are already in an active game.' });
    }

    // Remove any existing entry for this player to avoid duplicates
    await query('DELETE FROM matchmaking_queue WHERE player_id = $1', [playerId]);

    // Add to queue
    await query(
      `INSERT INTO matchmaking_queue (socket_id, player_id, player_name, elo, is_ranked)
       VALUES ($1, $2, $3, $4, $5)`,
      ['polling-' + playerId, playerId, trimmedName, elo || 1200, isRankedValue]
    );

    console.log(`[Matchmaking/HTTP] Player ${trimmedName} (${elo}) joined queue`);
    res.json({ success: true, message: 'Joined matchmaking queue' });
  } catch (error) {
    handleRouteError(res, error, 'Failed to join matchmaking queue');
  }
});

// Leave matchmaking queue (polling-based)
router.post('/leave', async (req, res) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Player ID required' });
    }

    await query('DELETE FROM matchmaking_queue WHERE player_id = $1', [playerId]);

    console.log(`[Matchmaking/HTTP] Player left queue`);
    res.json({ success: true, message: 'Left matchmaking queue' });
  } catch (error) {
    handleRouteError(res, error, 'Failed to leave matchmaking queue');
  }
});

// Check for match (polling-based)
router.get('/check-match', async (req, res) => {
  try {
    const { playerId } = req.query;

    if (!playerId) {
      return res.status(400).json({ matchFound: false });
    }

    // Check if player is in an active game
    const activeGame = await query(
      `SELECT game_id, white_player_id, black_player_id, white_player_name, black_player_name,
              white_elo, black_elo, status
       FROM active_games
       WHERE (white_player_id = $1 OR black_player_id = $1)
       AND status IN ('playing', 'waiting')
       LIMIT 1`,
      [playerId]
    );

    if (activeGame.rowCount === 0) {
      res.json({ matchFound: false });
      return;
    }

    const game = activeGame.rows[0];
    const isWhite = game.white_player_id === playerId;

    // Remove from queue if still there
    await query('DELETE FROM matchmaking_queue WHERE player_id = $1', [playerId]);

    res.json({
      matchFound: true,
      gameId: game.game_id,
      yourColor: isWhite ? 'white' : 'black',
      yourId: playerId,
      players: {
        white: {
          id: game.white_player_id,
          name: game.white_player_name,
          elo: game.white_elo
        },
        black: {
          id: game.black_player_id,
          name: game.black_player_name,
          elo: game.black_elo
        }
      },
      gameMode: 'ranked'
    });
  } catch (error) {
    handleRouteError(res, error, 'Failed to check for match');
  }
});

// Send heartbeat (polling-based)
router.post('/heartbeat', async (req, res) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ success: false });
    }

    await query(
      'UPDATE matchmaking_queue SET last_heartbeat = CURRENT_TIMESTAMP WHERE player_id = $1',
      [playerId]
    );

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update heartbeat');
  }
});

export default router;
