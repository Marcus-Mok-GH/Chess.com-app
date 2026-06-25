import express from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = express.Router();

// Login/Register
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') return errorResponse(res, 400, 'Username is required');
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2) return errorResponse(res, 400, 'Username must be at least 2 characters');
    if (trimmedUsername.length > 20) return errorResponse(res, 400, 'Username must be 20 characters or less');
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) return errorResponse(res, 400, 'Username can only contain letters, numbers, and underscores');

    let result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
      [trimmedUsername]
    );

    if (result.rows.length > 0) {
      await query(
        `INSERT INTO user_settings (user_id, settings) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING`,
        [result.rows[0].id]
      );
      const user = result.rows[0];
      return res.json({
        success: true,
        user: { id: user.id, username: user.username, elo: user.elo,
          gamesPlayed: user.games_played, wins: user.wins, losses: user.losses,
          draws: user.draws, createdAt: user.created_at },
        isNewUser: false,
      });
    }

    result = await query(
      'INSERT INTO users (username, elo) VALUES ($1, $2) RETURNING id, username, elo, games_played, wins, losses, draws, created_at',
      [trimmedUsername, 1200]
    );
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING`,
      [result.rows[0].id]
    );
    const newUser = result.rows[0];
    res.status(201).json({
      success: true,
      user: { id: newUser.id, username: newUser.username, elo: newUser.elo,
        gamesPlayed: newUser.games_played, wins: newUser.wins, losses: newUser.losses,
        draws: newUser.draws, createdAt: newUser.created_at },
      isNewUser: true,
    });
  } catch (error) {
    console.error('Login error:', error?.message, error?.code);
    if (error.code === '23505') {
      try {
        const result = await query(
          'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
          [req.body.username.trim()]
        );
        if (result.rows.length > 0) {
          const user = result.rows[0];
          return res.json({
            success: true,
            user: { id: user.id, username: user.username, elo: user.elo,
              gamesPlayed: user.games_played, wins: user.wins, losses: user.losses,
              draws: user.draws, createdAt: user.created_at },
            isNewUser: false,
          });
        }
      } catch (e) { console.error('Retry fetch error:', e); }
    }
    return handleRouteError(res, error, 'Failed to login');
  }
});

// Get user settings
router.get('/:username/settings', async (req, res) => {
  try {
    const { username } = req.params;
    const userResult = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (userResult.rows.length === 0) return errorResponse(res, 404, 'User not found');
    const settingsResult = await query('SELECT settings FROM user_settings WHERE user_id = $1', [userResult.rows[0].id]);
    res.json({ settings: settingsResult.rows[0]?.settings || {} });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get user settings');
  }
});

// Update user settings
router.post('/:username/settings', async (req, res) => {
  try {
    const { username } = req.params;
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return errorResponse(res, 400, 'Settings payload is required');
    const userResult = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (userResult.rows.length === 0) return errorResponse(res, 404, 'User not found');
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
      [userResult.rows[0].id, JSON.stringify(settings)]
    );
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update user settings');
  }
});

// Get user by username
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (result.rows.length === 0) return errorResponse(res, 404, 'User not found');
    const user = result.rows[0];
    res.json({ id: user.id, username: user.username, elo: user.elo,
      gamesPlayed: user.games_played, wins: user.wins, losses: user.losses,
      draws: user.draws, createdAt: user.created_at });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get user');
  }
});

// NOTE: POST /:username/elo removed — ELO is now server-side in games.js.

// Get leaderboard
router.get('/leaderboard/top', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const result = await query(
      'SELECT username, elo, games_played, wins, losses, draws FROM users ORDER BY elo DESC LIMIT $1',
      [limit]
    );
    res.json({
      leaderboard: result.rows.map((row, index) => ({
        rank: index + 1, username: row.username, elo: row.elo,
        gamesPlayed: row.games_played, wins: row.wins, losses: row.losses, draws: row.draws,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get leaderboard');
  }
});

// Get ELO history
router.get('/:username/elo-history', async (req, res) => {
  try {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await query(
      `SELECT eh.elo, eh.change, eh.game_code, eh.game_mode, eh.opponent_elo, eh.result, eh.created_at
       FROM elo_history eh
       JOIN users u ON eh.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
       ORDER BY eh.created_at ASC LIMIT $2`,
      [username, limit]
    );
    res.json(result.rows);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to get ELO history');
  }
});

export default router;