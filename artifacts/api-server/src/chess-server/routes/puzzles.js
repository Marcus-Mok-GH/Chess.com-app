/**
 * Puzzle Routes
 * API endpoints for chess puzzle generation and management
 */

import { Router } from 'express';
import { Chess } from 'chess.js';
import puzzleService from '../services/puzzleService.js';
import puzzleStatsService from '../services/puzzleStatsService.js';
import { requireSession } from '../auth.js';
import { LESSON_CATALOG, getLessonById } from '../lessons/lessonCatalog.js';
import {
  buildLessonPuzzle,
  isLessonPuzzleDifficulty,
  LESSON_PUZZLE_DIFFICULTIES,
  DEFAULT_LESSON_PUZZLE_DIFFICULTY,
} from '../puzzles/lessonPuzzle.js';
import { createRateLimiter, requestIp } from '../middleware/rateLimit.js';
import { consumePuzzle, getUsage } from '../services/puzzleQuota.js';
import { getStreak, recordSolve } from '../services/puzzleStreakService.js';

const router = Router();
router.use(requireSession);

// Generating a lesson puzzle is real CPU work (~170ms),
// so it is rate limited per IP: one puzzle per second sustained is far above
// what the puzzles page needs (it fetches one per lesson), while a script
// cannot spin the generator. Override the budget with
// PUZZLE_LESSON_RATE_MAX for tests or single-user deployments.
const DEFAULT_LESSON_RATE_MAX = 60;
const configuredLessonRateMax = Number.parseInt(process.env.PUZZLE_LESSON_RATE_MAX ?? '', 10);
const lessonPuzzleRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max:
    Number.isFinite(configuredLessonRateMax) && configuredLessonRateMax > 0
      ? configuredLessonRateMax
      : DEFAULT_LESSON_RATE_MAX,
  keyGenerator: (req) => 'puzzle:lesson:' + requestIp(req),
  message: 'Too many puzzle requests. Please try again in a minute.',
});

/**
 * Gate one puzzle handout against the free daily allowance and charge it.
 *
 * Returns the caller's usage after the puzzle was counted, or `false` when the
 * 402 was already written to the response. A quota lookup that fails (cold
 * database, transient error) never blocks play: the puzzle is served with
 * `usage: null` and the player is simply not charged.
 *
 * @param {string} userId
 * @param {import('express').Response} res
 * @returns {Promise<object|null|false>}
 */
async function chargeDailyPuzzle(userId, res) {
  try {
    const before = await getUsage(userId);
    if (!before.allowed) {
      res.status(402).json({
        success: false,
        code: 'PUZZLE_LIMIT_REACHED',
        error: { message: 'You have used your three free puzzles for today. Subscribe for unlimited puzzles.' },
        usage: before,
      });
      return false;
    }
    await consumePuzzle(userId);
    return await getUsage(userId);
  } catch (error) {
    console.error('Puzzle quota unavailable:', error);
    return null;
  }
}

/**
 * GET /api/puzzles
 * Get a list of puzzles with optional filtering
 * Query params: limit, difficulty, type, userId, method
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 10, difficulty, type, userId, method } = req.query;
    
    const options = {
      limit: Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50),
      difficulty,
      type,
      userId,
      method
    };
    
    const puzzles = puzzleService.getRandomPuzzles(options);
    
    res.json({
      success: true,
      puzzles,
      count: puzzles.length
    });
    
  } catch (error) {
    console.error('Get puzzles error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get puzzles' }
    });
  }
});

/**
 * GET /api/puzzles/random
 * Get a single random puzzle
 * Query params: difficulty, type, userId, method
 */
router.get('/random', async (req, res) => {
  try {
    const { difficulty, type, userId, method } = req.query;
    
    const puzzle = puzzleService.getRandomPuzzle({
      difficulty,
      type,
      userId,
      method
    });
    
    if (!puzzle) {
      return res.status(404).json({
        success: false,
        error: { message: 'Puzzle not found' }
      });
    }

    // Free players get three puzzles a day; subscribers are unlimited.
    const usage = await chargeDailyPuzzle(req.userId, res);
    if (usage === false) return;

    res.json({
      success: true,
      puzzle,
      usage
    });
    
  } catch (error) {
    console.error('Get random puzzle error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get puzzle' }
    });
  }
});

/**
 * POST /api/puzzles/generate
 * Generate a new puzzle with specified options
 * Body: { method, difficulty, type, description, provider, userId }
 */
router.post('/generate', (req, res) => generatePuzzleResponse(req.body, res));

/**
 * Shared by the POST and GET /generate routes; `params` is the request body
 * or query string respectively.
 */
async function generatePuzzleResponse(params, res) {
  try {
    const {
      method = 'auto',
      difficulty = 'medium',
      type = 'tactics',
      description = '',
      provider = 'default',
      userId = null
    } = params;

    const puzzle = await puzzleService.generatePuzzle({
      method,
      difficulty,
      type,
      description,
      provider,
      userId
    });

    if (!puzzle) {
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to generate puzzle' }
      });
    }

    res.json({
      success: true,
      puzzle
    });
  } catch (error) {
    console.error('Generate puzzle error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to generate puzzle' }
    });
  }
}

/**
 * GET /api/puzzles/generate
 * Generate a new puzzle (GET version for simple clients)
 * Query params: method, difficulty, type, description, provider, userId
 */
router.get('/generate', (req, res) => generatePuzzleResponse(req.query, res));

/**
 * POST /api/puzzles/validate
 * Validate a puzzle solution
 * Body: { puzzleId, move }
 */
router.post('/validate', async (req, res) => {
  try {
    const { puzzleId, move } = req.body;
    
    if (!puzzleId || !move) {
      return res.status(400).json({
        success: false,
        error: { message: 'puzzleId and move are required' }
      });
    }
    
    const result = await puzzleService.validateSolution(puzzleId, move);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Validate solution error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to validate solution' }
    });
  }
});

/**
 * GET /api/puzzles/streak
 * Authenticated. The account's daily puzzle streak as it stands today.
 */
router.get('/streak', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, streak: await getStreak(req.userId) });
  } catch (error) {
    console.error('Get puzzle streak error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to load puzzle streak' } });
  }
});

/**
 * POST /api/puzzles/streak
 * Authenticated. Records today's daily-puzzle solve. Idempotent: calling it
 * twice on the same day returns the same streak instead of counting twice.
 */
router.post('/streak', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, streak: await recordSolve(req.userId) });
  } catch (error) {
    console.error('Record puzzle streak error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to record puzzle streak' } });
  }
});

/**
 * GET /api/puzzles/usage
 * How many puzzles the account has left today, plus the reset time.
 */
router.get('/usage', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, usage: await getUsage(req.userId) });
  } catch (error) {
    console.error('Get puzzle usage error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to load puzzle usage' } });
  }
});

/**
 * GET /api/puzzles/stats
 * Get puzzle statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = puzzleService.getPuzzleStats();
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get stats' }
    });
  }
});

/**
 * GET /api/puzzles/stats/user
 * Authenticated. Return the caller's saved puzzle stats (solved count,
 * attempted count, streak, best streak, rating). Registered before the
 * /:id route so "stats" is not captured as a puzzle id.
 */
router.get('/stats/user', async (req, res) => {
  try {
    const stats = await puzzleStatsService.getStats(req.userId);
    res.json({ success: true, stats: stats || puzzleStatsService.emptyStats() });
  } catch (error) {
    console.error('Get user puzzle stats error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to get puzzle stats' } });
  }
});

/**
 * PUT /api/puzzles/stats/user
 * Authenticated. Upsert the caller's puzzle stats.
 * Body: { solvedCount, attemptedCount, currentStreak, bestStreak, rating }
 */
router.put('/stats/user', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = ['solvedCount', 'attemptedCount', 'currentStreak', 'bestStreak', 'rating'];
    for (const field of fields) {
      const value = body[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return res.status(400).json({ success: false, error: { message: `${field} must be a finite number` } });
      }
    }
    const stats = await puzzleStatsService.saveStats(req.userId, body);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Save user puzzle stats error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to save puzzle stats' } });
  }
});

/**
 * GET /api/puzzles/lesson
 * Generate the puzzle for one lesson-scheme entry ON THE SERVER, so
 * devices that are slow (or without module worker support) never have to run
 * the generator locally.
 * Query params: lesson (catalog id, required), difficulty
 * (beginner|easy|intermediate|advanced, default beginner), seed (optional int)
 */
router.get('/lesson', lessonPuzzleRateLimit, async (req, res) => {
  try {
    const lessonId = typeof req.query.lesson === 'string' ? req.query.lesson.trim() : '';
    if (!lessonId) {
      return res.status(400).json({ success: false, error: { message: 'lesson is required' } });
    }

    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return res.status(400).json({ success: false, error: { message: `Unknown lesson: ${lessonId}` } });
    }

    const requestedDifficulty = String(
      req.query.difficulty ?? DEFAULT_LESSON_PUZZLE_DIFFICULTY,
    ).toLowerCase();
    if (!isLessonPuzzleDifficulty(requestedDifficulty)) {
      return res.status(400).json({
        success: false,
        error: { message: `difficulty must be one of: ${LESSON_PUZZLE_DIFFICULTIES.join(', ')}` },
      });
    }

    let seed;
    if (req.query.seed !== undefined && req.query.seed !== '') {
      const parsedSeed = Number(req.query.seed);
      if (!Number.isFinite(parsedSeed)) {
        return res.status(400).json({ success: false, error: { message: 'seed must be a number' } });
      }
      seed = Math.trunc(parsedSeed);
    }

    const lessonIndex = LESSON_CATALOG.findIndex((entry) => entry.id === lesson.id);
    const puzzle = buildLessonPuzzle({
      lesson,
      lessonIndex: lessonIndex >= 0 ? lessonIndex : 0,
      seed,
      difficulty: requestedDifficulty,
    });

    // Free players get three puzzles a day; subscribers and reviewers are
    // unlimited. Charged only once a puzzle actually exists, so a bad request
    // or a generator failure never costs the player one of their three.
    const usage = await chargeDailyPuzzle(req.userId, res);
    if (usage === false) return;

    // Fresh position per request (and, with a seed, deterministic).
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, puzzle, usage });
  } catch (error) {
    console.error('Generate lesson puzzle error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to generate lesson puzzle' } });
  }
});

/**
 * GET /api/puzzles/base
 * Get the base (hardcoded) puzzles
 */
router.get('/base', async (req, res) => {
  try {
    const puzzle = await puzzleService.generatePuzzle({
      method: 'rules',
      difficulty: 'medium',
      type: 'tactics'
    });
    res.json({
      success: true,
      puzzles: [puzzle],
      count: 1
    });

  } catch (error) {
    console.error('Get base puzzles error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get base puzzles' }
    });
  }
});

/**
 * POST /api/puzzles/ai
 * Generate a puzzle using AI with a text description
 * Body: { description, provider, difficulty, type, userId, language }
 */
router.post('/ai', async (req, res) => {
  try {
    const {
      description,
      provider = 'default',
      difficulty = 'medium',
      type = 'tactics',
      userId = null,
      language = null
    } = req.body;
    
    if (!description) {
      return res.status(400).json({
        success: false,
        error: { message: 'Description is required for AI puzzle generation' }
      });
    }
    
    const puzzle = await puzzleService.generatePuzzle({
      method: 'ai',
      description,
      provider,
      difficulty,
      type,
      userId,
      language
    });
    
    res.json({
      success: true,
      puzzle
    });
    
  } catch (error) {
    console.error('AI puzzle generation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to generate AI puzzle' }
    });
  }
});

/**
 * POST /api/puzzles/stockfish
 * Generate a puzzle using Stockfish
 * Body: { difficulty, type, userId }
 */
router.post('/stockfish', async (req, res) => {
  try {
    const {
      difficulty = 'medium',
      type = 'mate-in-1',
      userId = null
    } = req.body;
    
    const puzzle = await puzzleService.generatePuzzle({
      method: 'stockfish',
      difficulty,
      type,
      userId
    });
    
    res.json({
      success: true,
      puzzle
    });
    
  } catch (error) {
    console.error('Stockfish puzzle generation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to generate Stockfish puzzle' }
    });
  }
});

/**
 * GET /api/puzzles/user/:userId
 * Get puzzles generated by a specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.userId) {
      return res.status(403).json({ success: false, error: { message: 'You can only access your own puzzles' } });
    }
    const puzzles = puzzleService.getPuzzlesByUser(userId);
    
    res.json({
      success: true,
      puzzles,
      count: puzzles.length
    });
    
  } catch (error) {
    console.error('Get user puzzles error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get user puzzles' }
    });
  }
});

/**
 * GET /api/puzzles/:id
 * Get a specific puzzle by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const puzzle = puzzleService.getPuzzleById(id);
    
    if (!puzzle) {
      return res.status(404).json({
        success: false,
        error: { message: 'Puzzle not found' }
      });
    }
    
    res.json({
      success: true,
      puzzle
    });
    
  } catch (error) {
    console.error('Get puzzle by ID error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get puzzle' }
    });
  }
});

/**
 * DELETE /api/puzzles/:id
 * Delete a puzzle
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const puzzle = puzzleService.getPuzzleById(id);
    if (!puzzle || String(puzzle.userId) !== req.userId) return res.status(404).json({ success: false, error: { message: 'Puzzle not found' } });
    const success = puzzleService.deletePuzzle(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: { message: 'Puzzle not found' }
      });
    }
    
    res.json({
      success: true,
      message: 'Puzzle deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete puzzle error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete puzzle' }
    });
  }
});

export default router;
