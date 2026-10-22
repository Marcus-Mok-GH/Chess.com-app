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
  findBookMovesInOrder,
} from '../openings/openingBook.js';

const router = Router();

// Game-review payloads carry one pair per played move. Lookups are pure
// in-memory map reads, so this comfortably fits any real game inside the
// serverless function budget.
const BOOK_MOVES_MAX_ITEMS = 64;

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
 * POST /api/openings/book-moves
 * Batch book-move lookup for game review: for each { fen, uci } pair (played
 * plies in order), reports whether the move continues the opening book's
 * theory from the previous plies. Results keep the request order so clients
 * can align them to their ply indexes.
 */
router.post('/book-moves', (req, res) => {
  try {
    const { moves } = req.body || {};
    if (!Array.isArray(moves) || moves.length === 0) {
      return errorResponse(res, 400, 'Missing required field: moves (non-empty array)');
    }
    if (moves.length > BOOK_MOVES_MAX_ITEMS) {
      return errorResponse(res, 400, `Too many moves: send at most ${BOOK_MOVES_MAX_ITEMS} per request`);
    }

    const found = findBookMovesInOrder(moves);
    const results = moves.map((item, index) => ({
      fen: item?.fen ?? null,
      uci: item?.uci ?? null,
      san: found[index]?.san ?? null,
      book: found[index]?.book ?? false,
    }));

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Book-move lookup error:', error);
    return errorResponse(res, 500, 'Failed to look up book moves');
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
