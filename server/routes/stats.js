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

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(userCount.rows[0].count, 10),
        totalGames: parseInt(gameCount.rows[0].count, 10),
        activePlayers: 0 // Placeholder for real-time tracking
      }
    });
  } catch (error) {
    console.error('[Stats] Public stats error:', error);
    return handleRouteError(res, error, 'Failed to fetch public stats');
  }
});

export default router;
