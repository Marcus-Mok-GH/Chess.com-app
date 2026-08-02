import { Router } from 'express';
import { query } from '../db.js';
import { handleRouteError } from '../middleware/errors.js';

const router = Router();

// GET /api/stats/public
// Returns public statistics for the application
router.get('/public', async (req, res) => {
  try {
    const userCount = await query('SELECT COUNT(*) FROM users');
    const gameCount = await query('SELECT COUNT(*) FROM games');

    const total = parseInt(userCount.rows[0].count, 10);
    const games = parseInt(gameCount.rows[0].count, 10);
    res.json({
      totalUsers: total,
      registeredPlayers: total,
      totalGames: games,
      gamesRecorded: games,
      liveGames: 0,
      livePlayers: 0,
      serverUptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error('[Stats] Public stats error:', error);
    return handleRouteError(res, error, 'Failed to fetch public stats');
  }
});

export default router;
