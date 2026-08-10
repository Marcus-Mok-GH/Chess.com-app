/**
 * Opening Explorer Routes
 * Public API endpoints for browsing the embedded chess opening book.
 */

import { Router } from 'express';
import { errorResponse } from '../middleware/errors.js';
import {
  getRoots,
  getPosition,
  legalChildren,
  searchOpenings,
} from '../openings/openingBook.js';

const router = Router();

/**
 * GET /api/openings
 * Top-level named openings with name, eco, fen, and stats.
 */
router.get('/', (req, res) => {
  try {
    const openings = getRoots();
    res.json({
      success: true,
      openings,
      count: openings.length,
    });
  } catch (error) {
    console.error('Get openings error:', error);
    return errorResponse(res, 500, 'Failed to load openings');
  }
});

/**
 * GET /api/openings/children?fen=<urlencoded>
 * Legal child moves from the book for a position FEN (empty for unknown positions).
 */
router.get('/children', (req, res) => {
  try {
    const { fen } = req.query;
    if (!fen) {
      return errorResponse(res, 400, 'Missing required field: fen');
    }

    const children = legalChildren(String(fen));
    const position = getPosition(String(fen));

    res.json({
      success: true,
      children,
      position,
    });
  } catch (error) {
    console.error('Get opening children error:', error);
    return errorResponse(res, 500, 'Failed to load opening children');
  }
});

/**
 * GET /api/openings/search?q=<query>
 * Case-insensitive substring search over opening names and ECO codes.
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return errorResponse(res, 400, 'Missing required field: q');
    }

    const results = searchOpenings(String(q));

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search openings error:', error);
    return errorResponse(res, 500, 'Failed to search openings');
  }
});

export default router;
