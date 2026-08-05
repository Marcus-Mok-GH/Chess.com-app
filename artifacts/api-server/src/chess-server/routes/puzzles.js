/**
 * Puzzle Routes
 * API endpoints for chess puzzle generation and management
 */

import { Router } from 'express';
import { Chess } from 'chess.js';
import puzzleService from '../services/puzzleService.js';
import { BASE_PUZZLES } from '../puzzles/puzzleGenerator.js';

const router = Router();

/**
 * GET /api/puzzles
 * Get a list of puzzles with optional filtering
 * Query params: limit, difficulty, type, userId, method
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 10, difficulty, type, userId, method } = req.query;
    
    const options = {
      limit: parseInt(limit) || 10,
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
    
    res.json({
      success: true,
      puzzle
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
router.post('/generate', async (req, res) => {
  try {
    const {
      method = 'auto',
      difficulty = 'medium',
      type = 'tactics',
      description = '',
      provider = 'default',
      userId = null
    } = req.body;
    
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
});

/**
 * GET /api/puzzles/generate
 * Generate a new puzzle (GET version for simple clients)
 * Query params: method, difficulty, type, description, provider, userId
 */
router.get('/generate', async (req, res) => {
  try {
    const {
      method = 'auto',
      difficulty = 'medium',
      type = 'tactics',
      description = '',
      provider = 'default',
      userId = null
    } = req.query;
    
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
});

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
 * GET /api/puzzles/base
 * Get the base (hardcoded) puzzles
 */
router.get('/base', async (req, res) => {
  try {
    res.json({
      success: true,
      puzzles: BASE_PUZZLES,
      count: BASE_PUZZLES.length
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
 * Body: { description, provider, difficulty, type, userId }
 */
router.post('/ai', async (req, res) => {
  try {
    const {
      description,
      provider = 'default',
      difficulty = 'medium',
      type = 'tactics',
      userId = null
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
      userId
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
