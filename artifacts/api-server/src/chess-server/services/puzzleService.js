/**
 * Puzzle Service
 * Central service for managing and generating chess puzzles
 * 
 * Supports three generation methods:
 * 1. Hardcoded rules (procedural generation)
 * 2. Stockfish engine (for mate-in-N puzzles)
 * 3. AI providers (for natural language descriptions)
 */

import { Chess } from 'chess.js';
import { BASE_PUZZLES, generatePuzzle as generatePuzzleFromGenerator, validateGeneratedPuzzle } from '../puzzles/puzzleGenerator.js';
import aiPuzzleService from './aiPuzzleService.js';
import stockfishService from './stockfishService.js';

// In-memory storage for generated puzzles (persist to DB in production)
const generatedPuzzles = new Map();

// Statistics tracking
const stats = {
  totalGenerated: 0,
  byMethod: {
    rules: 0,
    stockfish: 0,
    ai: 0
  },
  byDifficulty: {
    easy: 0,
    medium: 0,
    hard: 0
  },
  byType: {},
  solved: 0,
  failed: 0
};

/**
 * Get a random puzzle from the base set
 * @param {Object} options - Filter options
 * @returns {Puzzle}
 */
export function getRandomPuzzle(options = {}) {
  const { difficulty, type, userId, method = 'base' } = options;
  
  let puzzles = [...BASE_PUZZLES];
  
  // Filter by difficulty
  if (difficulty) {
    puzzles = puzzles.filter(p => 
      p.difficulty === difficulty || 
      (p.rating >= getDifficultyRange(difficulty).min && p.rating <= getDifficultyRange(difficulty).max)
    );
  }
  
  // Filter by type
  if (type) {
    puzzles = puzzles.filter(p => p.type === type);
  }
  
  // Filter by method
  if (method !== 'base') {
    puzzles = puzzles.filter(p => p.method === method);
  }
  
  if (puzzles.length === 0) {
    // Fallback to any puzzle
    puzzles = [...BASE_PUZZLES];
  }
  
  // Select a random puzzle
  const randomIndex = Math.floor(Math.random() * puzzles.length);
  const puzzle = { ...puzzles[randomIndex] };
  
  // Add metadata
  puzzle.id = puzzle.id || `base-${randomIndex}`;
  puzzle.method = puzzle.method || 'base';
  puzzle.generatedAt = puzzle.generatedAt || new Date().toISOString();
  
  return puzzle;
}

/**
 * Get multiple random puzzles
 * @param {Object} options - Filter options
 * @returns {Puzzle[]}
 */
export function getRandomPuzzles(options = {}) {
  const { limit = 10, ...rest } = options;
  const puzzles = [];
  
  for (let i = 0; i < limit; i++) {
    const puzzle = getRandomPuzzle(rest);
    // Ensure uniqueness
    if (!puzzles.some(p => p.id === puzzle.id)) {
      puzzles.push(puzzle);
    }
  }
  
  return puzzles;
}

/**
 * Get a puzzle by ID
 * @param {string} id 
 * @returns {Puzzle|null}
 */
export function getPuzzleById(id) {
  // Check generated puzzles first
  if (generatedPuzzles.has(id)) {
    return generatedPuzzles.get(id);
  }

  // Check base puzzles. Base puzzles have no stable `id` field; the service
  // fabricates `base-<index>` ids (see getRandomPuzzle). Decode those indices
  // so follow-up lookups by GET /api/puzzles/:id actually resolve.
  if (typeof id === 'string' && id.startsWith('base-')) {
    const index = Number(id.slice(5));
    if (Number.isInteger(index) && index >= 0 && index < BASE_PUZZLES.length) {
      return { ...BASE_PUZZLES[index], id };
    }
  }

  // Allow base puzzles that DO carry a real id, if any are added later.
  const basePuzzle = BASE_PUZZLES.find(p => p.id === id);
  if (basePuzzle) {
    return { ...basePuzzle };
  }

  return null;
}

/**
 * Generate a new puzzle using the specified method
 * @param {Object} options - Generation options
 * @returns {Promise<Puzzle>}
 */
export async function generatePuzzle(options = {}) {
  const {
    method = 'rules',
    difficulty = 'medium',
    type = 'tactics',
    description = '',
    provider = 'default',
    userId = null
  } = options;
  
  let puzzle;
  
  switch (method) {
    case 'ai':
      puzzle = await aiPuzzleService.generatePuzzleWithAI(description, { difficulty, type, provider });
      stats.byMethod.ai++;
      break;
      
    case 'stockfish':
      puzzle = await stockfishService.generateMateInNPuzzle({ difficulty, type });
      if (!puzzle) {
        puzzle = generatePuzzleFromGenerator(Date.now());
        puzzle.method = 'stockfish-fallback';
        puzzle.requestedMethod = 'stockfish';
      }
      stats.byMethod.stockfish++;
      break;
      
    case 'rules':
    default:
      // Generate a unique seed based on options
      const seed = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      puzzle = generatePuzzleFromGenerator(seed, { difficulty, type });
      puzzle.method = 'rules';
      stats.byMethod.rules++;
      break;
  }
  
  // Add common metadata
  puzzle.id = puzzle.id || `gen-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  puzzle.generatedAt = puzzle.generatedAt || new Date().toISOString();
  puzzle.difficulty = puzzle.difficulty || difficulty;
  puzzle.type = puzzle.type || type;
  puzzle.method = puzzle.method || method;
  
  if (userId) {
    puzzle.userId = userId;
  }
  
  // Store the generated puzzle
  generatedPuzzles.set(puzzle.id, puzzle);
  
  // Update statistics
  stats.totalGenerated++;
  stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;
  stats.byType[type] = (stats.byType[type] || 0) + 1;
  
  return puzzle;
}

/**
 * Validate a puzzle solution
 * @param {string} puzzleId 
 * @param {string} move 
 * @returns {Promise<Object>}
 */
export async function validateSolution(puzzleId, move) {
  const puzzle = getPuzzleById(puzzleId);
  
  if (!puzzle) {
    stats.failed++;
    return {
      valid: false,
      error: 'Puzzle not found'
    };
  }
  
  try {
    const chess = new Chess(puzzle.fen);
    
    // Try to make the move
    const result = chess.move(move);
    
    if (!result) {
      stats.failed++;
      return {
        valid: false,
        error: 'Invalid move',
        expected: puzzle.solution
      };
    }
    
    // Check if the move matches the expected solution.
    // NOTE: compare against the move we just applied (result.san / lan / from+to),
    // do NOT re-apply puzzle.solution on the resulting position — after the
    // player's move it becomes the opponent's turn, so a follow-up move would be
    // illegal and `chess.move(puzzle.solution)` would always return null for the
    // side that is supposed to move next in the puzzle.
    const sol = puzzle.solution;
    const isCorrect =
      result.san === sol ||
      result.lan === sol ||
      `${result.from}${result.to}${result.promotion || ''}` === sol ||
      `${result.from}${result.to}` === sol;
    
    if (isCorrect) {
      stats.solved++;
      
      // For mate puzzles, verify checkmate
      let isMate = false;
      if (puzzle.type && puzzle.type.startsWith('mate-in')) {
        const moves = puzzle.type.replace('mate-in-', '');
        const expectedMateIn = parseInt(moves);
        
        // Check if we've reached checkmate
        if (chess.isCheckmate()) {
          isMate = true;
        }
      }
      
      return {
        valid: true,
        correct: true,
        isMate,
        fenAfter: chess.fen(),
        puzzle
      };
    } else {
      stats.failed++;
      return {
        valid: true,
        correct: false,
        error: 'Incorrect move',
        expected: puzzle.solution
      };
    }
    
  } catch (error) {
    stats.failed++;
    return {
      valid: false,
      error: error.message || 'Validation failed'
    };
  }
}

/**
 * Get puzzles generated by a specific user
 * @param {string} userId 
 * @returns {Puzzle[]}
 */
export function getPuzzlesByUser(userId) {
  return Array.from(generatedPuzzles.values())
    .filter(p => p.userId === userId);
}

/**
 * Delete a puzzle
 * @param {string} id 
 * @returns {boolean}
 */
export function deletePuzzle(id) {
  if (generatedPuzzles.has(id)) {
    generatedPuzzles.delete(id);
    return true;
  }
  
  // Check if it's a base puzzle (can't delete)
  const basePuzzle = BASE_PUZZLES.find(p => p.id === id);
  if (basePuzzle) {
    return false; // Can't delete base puzzles
  }
  
  return false;
}

/**
 * Get puzzle statistics
 * @returns {Object}
 */
export function getPuzzleStats() {
  return {
    ...stats,
    generatedPuzzlesCount: generatedPuzzles.size,
    basePuzzlesCount: BASE_PUZZLES.length
  };
}

/**
 * Get difficulty rating range
 * @param {string} difficulty 
 * @returns {Object}
 */
function getDifficultyRange(difficulty) {
  const ranges = {
    easy: { min: 600, max: 1200 },
    medium: { min: 1200, max: 1800 },
    hard: { min: 1800, max: 2500 }
  };
  
  return ranges[difficulty] || ranges.medium;
}

/**
 * Generate a puzzle using a specific method
 * @param {string} method 
 * @param {Object} options 
 * @returns {Promise<Puzzle>}
 */
export async function generateWithMethod(method, options = {}) {
  return generatePuzzle({ method, ...options });
}

/**
 * Generate a puzzle from a FEN string
 * @param {string} fen 
 * @param {Object} options 
 * @returns {Puzzle}
 */
export function generateFromFEN(fen, options = {}) {
  const { difficulty = 'medium', type = 'tactics', solution = null } = options;
  
  const chess = new Chess(fen);
  
  if (!chess.validateFEN(fen)) {
    throw new Error('Invalid FEN');
  }
  
  // Generate a puzzle object
  const puzzle = {
    id: `fen-${Date.now()}`,
    fen,
    rating: getRatingFromFEN(fen),
    theme: inferThemeFromFEN(fen),
    type,
    difficulty,
    solution: solution || findBestMove(fen),
    method: 'fen',
    generatedAt: new Date().toISOString()
  };
  
  // Validate the puzzle
  if (!validateGeneratedPuzzle(puzzle)) {
    throw new Error('Generated puzzle from FEN did not pass validation');
  }
  
  // Store it
  generatedPuzzles.set(puzzle.id, puzzle);
  
  return puzzle;
}

/**
 * Infer a rating from FEN complexity
 * @param {string} fen 
 * @returns {number}
 */
function getRatingFromFEN(fen) {
  const chess = new Chess(fen);
  const board = chess.getBoard();
  
  // Count pieces
  let pieceCount = 0;
  for (const row of board) {
    for (const square of row) {
      if (square) pieceCount++;
    }
  }
  
  // More pieces = higher rating (more complex)
  // Fewer pieces = lower rating (simpler endgame)
  const baseRating = 1200;
  const pieceFactor = pieceCount * 20;
  
  return Math.max(600, Math.min(2200, baseRating + pieceFactor));
}

/**
 * Infer theme from FEN position
 * @param {string} fen 
 * @returns {string}
 */
function inferThemeFromFEN(fen) {
  const chess = new Chess(fen);
  const board = chess.getBoard();
  
  // Check for endgame patterns
  const pieceCount = board.flat().filter(Boolean).length;
  
  if (pieceCount <= 5) {
    return 'Endgame';
  }
  
  if (pieceCount <= 10) {
    return 'Simplified Position';
  }
  
  // Check for specific patterns
  if (isBackRankMatePossible(chess)) {
    return 'Back-rank Mate';
  }
  
  if (hasForkOpportunity(chess)) {
    return 'Fork';
  }
  
  if (hasPinOpportunity(chess)) {
    return 'Pin';
  }
  
  return 'Tactical Position';
}

/**
 * Check if back-rank mate is possible
 * @param {Chess} chess 
 * @returns {boolean}
 */
function isBackRankMatePossible(chess) {
  // Simplified check - look for king on back rank with limited escape squares
  const kingSquare = chess.getKingSquare(chess.turn());
  if (!kingSquare) return false;
  
  const rank = kingSquare[1];
  const isOnBackRank = (chess.turn() === 'w' && rank === '1') || 
                       (chess.turn() === 'b' && rank === '8');
  
  return isOnBackRank;
}

/**
 * Check if there's a fork opportunity
 * @param {Chess} chess 
 * @returns {boolean}
 */
function hasForkOpportunity(chess) {
  // Simplified - just return true for now
  // A full implementation would analyze the position for fork patterns
  return true;
}

/**
 * Check if there's a pin opportunity
 * @param {Chess} chess 
 * @returns {boolean}
 */
function hasPinOpportunity(chess) {
  // Simplified - just return true for now
  return true;
}

/**
 * Find the best move for a position (simplified)
 * @param {string} fen 
 * @returns {string}
 */
function findBestMove(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves();
  
  if (moves.length === 0) return null;
  
  // For now, just return the first move
  // In a full implementation, this would use Stockfish or evaluation
  return moves[0];
}

/**
 * Clear all generated puzzles (for testing)
 */
export function clearGeneratedPuzzles() {
  generatedPuzzles.clear();
}

/**
 * Import puzzles from PGN
 * @param {string} pgn 
 * @returns {Puzzle[]}
 */
export function importFromPGN(pgn) {
  // Parse PGN and extract puzzle positions
  // This is a placeholder for PGN import functionality
  return [];
}

/**
 * Export puzzles to PGN
 * @param {Puzzle[]} puzzles 
 * @returns {string}
 */
export function exportToPGN(puzzles) {
  // Convert puzzles to PGN format
  // This is a placeholder for PGN export functionality
  return '';
}

export default {
  getRandomPuzzle,
  getRandomPuzzles,
  getPuzzleById,
  generatePuzzle,
  validateSolution,
  getPuzzlesByUser,
  deletePuzzle,
  getPuzzleStats,
  generateWithMethod,
  generateFromFEN,
  clearGeneratedPuzzles,
  importFromPGN,
  exportToPGN
};
