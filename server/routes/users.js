import express from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = express.Router();

// Login/Register - creates user if doesn't exist, returns user data
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string') {
      return errorResponse(res, 400, 'Username is required');
    }
    
    const trimmedUsername = username.trim();
    
    if (trimmedUsername.length < 2) {
      return errorResponse(res, 400, 'Username must be at least 2 characters');
    }
    
    if (trimmedUsername.length > 20) {
      return errorResponse(res, 400, 'Username must be 20 characters or less');
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return errorResponse(res, 400, 'Username can only contain letters, numbers, and underscores');
    }
    
    // Try to find existing user
    let result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
      [trimmedUsername]
    );
    
    if (result.rows.length > 0) {
      // Ensure user settings row exists
      await query(
        `INSERT INTO user_settings (user_id, settings)
         VALUES ($1, '{}'::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [result.rows[0].id]
      );

      // User exists, return their data
      const user = result.rows[0];
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          elo: user.elo,
          gamesPlayed: user.games_played,
          wins: user.wins,
          losses: user.losses,
          draws: user.draws,
          createdAt: user.created_at
        },
        isNewUser: false
      });
    }
    
    // Create new user
    result = await query(
      'INSERT INTO users (username, elo) VALUES ($1, $2) RETURNING id, username, elo, games_played, wins, losses, draws, created_at',
      [trimmedUsername, 1200]
    );

    await query(
      `INSERT INTO user_settings (user_id, settings)
       VALUES ($1, '{}'::jsonb)
       ON CONFLICT (user_id) DO NOTHING`,
      [result.rows[0].id]
    );
    
    const newUser = result.rows[0];
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        elo: newUser.elo,
        gamesPlayed: newUser.games_played,
        wins: newUser.wins,
        losses: newUser.losses,
        draws: newUser.draws,
        createdAt: newUser.created_at
      },
      isNewUser: true
    });
    
  } catch (error) {
    console.error('Login error:', error);
    if (error.code === '23505') {
      // Unique violation - race condition, try to fetch
      try {
        const result = await query(
          'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
          [req.body.username.trim()]
        );
        if (result.rows.length > 0) {
          const user = result.rows[0];
          return res.json({
            success: true,
            user: {
              id: user.id,
              username: user.username,
              elo: user.elo,
              gamesPlayed: user.games_played,
              wins: user.wins,
              losses: user.losses,
              draws: user.draws,
              createdAt: user.created_at
            },
            isNewUser: false
          });
        }
      } catch (e) {
        console.error('Retry fetch error:', e);
      }
    }
    return handleRouteError(res, error, 'Failed to login');
  }
});

// Get user settings
router.get('/:username/settings', async (req, res) => {
  try {
    const { username } = req.params;

    const userResult = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (userResult.rows.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }

    const settingsResult = await query(
      'SELECT settings FROM user_settings WHERE user_id = $1',
      [userResult.rows[0].id]
    );

    res.json({
      settings: settingsResult.rows[0]?.settings || {}
    });
  } catch (error) {
    console.error('Get user settings error:', error);
    return handleRouteError(res, error, 'Failed to get user settings');
  }
});

// Update user settings
router.post('/:username/settings', async (req, res) => {
  try {
    const { username } = req.params;
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return errorResponse(res, 400, 'Settings payload is required');
    }

    const userResult = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (userResult.rows.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }

    await query(
      `INSERT INTO user_settings (user_id, settings)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
      [userResult.rows[0].id, JSON.stringify(settings)]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update user settings error:', error);
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
    
    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }
    
    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      elo: user.elo,
      gamesPlayed: user.games_played,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      createdAt: user.created_at
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    return handleRouteError(res, error, 'Failed to get user');
  }
});

// Update user ELO after a game
router.post('/:username/elo', async (req, res) => {
  try {
    const { username } = req.params;
    const { opponentElo, result: gameResult } = req.body;
    
    if (typeof opponentElo !== 'number' || !['win', 'loss', 'draw'].includes(gameResult)) {
      return errorResponse(res, 400, 'Invalid parameters');
    }
    
    // Get current user
    const userResult = await query(
      'SELECT id, elo, games_played, wins, losses, draws FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }
    
    const user = userResult.rows[0];
    const K_FACTOR = 32;
    
    // Calculate new ELO
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - user.elo) / 400));
    const actualScore = gameResult === 'win' ? 1 : gameResult === 'draw' ? 0.5 : 0;
    const newElo = Math.round(user.elo + K_FACTOR * (actualScore - expectedScore));
    
    // Update stats
    const wins = user.wins + (gameResult === 'win' ? 1 : 0);
    const losses = user.losses + (gameResult === 'loss' ? 1 : 0);
    const draws = user.draws + (gameResult === 'draw' ? 1 : 0);
    const gamesPlayed = user.games_played + 1;
    
    await query(
      'UPDATE users SET elo = $1, games_played = $2, wins = $3, losses = $4, draws = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      [newElo, gamesPlayed, wins, losses, draws, user.id]
    );
    
    res.json({
      success: true,
      previousElo: user.elo,
      newElo,
      change: newElo - user.elo,
      gamesPlayed,
      wins,
      losses,
      draws
    });
    
  } catch (error) {
    console.error('Update ELO error:', error);
    return handleRouteError(res, error, 'Failed to update ELO');
  }
});

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
        rank: index + 1,
        username: row.username,
        elo: row.elo,
        gamesPlayed: row.games_played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws
      }))
    });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    return handleRouteError(res, error, 'Failed to get leaderboard');
  }
});

export default router;
