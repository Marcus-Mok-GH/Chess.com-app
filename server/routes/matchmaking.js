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

export default router;
