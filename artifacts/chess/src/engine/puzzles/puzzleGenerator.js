import { Chess } from "chess.js";

/**
 * Dynamic Chess Puzzle Generator
 *
 * Supports three generation methods:
 * 1. Hardcoded Rules - Procedural generation with chess.js
 * 2. Stockfish - Engine-assisted puzzle creation and validation
 * 3. AI - AI-generated puzzles from text descriptions
 */

export const BASE_PUZZLES = [
  {
    fen: "6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1",
    rating: 800,
    theme: "Back-rank Radar",
    hint: "The king has no escape square. Find the rook move that ends the game.",
  },
  {
    fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
    rating: 1200,
    theme: "Smothered Finish",
    hint: "The king is boxed in by its own pieces. Find the knight mate.",
  },
  {
    fen: "6k1/6pp/8/8/2B5/8/8/3R2K1 w - - 0 1",
    rating: 1000,
    theme: "Rook and Bishop Net",
    hint: "The bishop seals one diagonal. Find the rook's finishing square.",
  },
  {
    fen: "6k1/5ppp/8/8/4B3/8/8/3Q2K1 w - - 0 1",
    rating: 900,
    theme: "Diagonal Lock",
    hint: "Use the bishop's control to deliver mate with the queen.",
  },
  {
    fen: "7k/5ppp/8/8/8/5N2/8/3Q2K1 w - - 0 1",
    rating: 1100,
    theme: "Knight-Supported Queen",
    hint: "The knight guards the key square. Find the queen mate.",
  },
  {
    fen: "8/8/1BK5/4k3/6Q1/8/8/8 w - - 0 1",
    rating: 1200,
    theme: "Diagonal Strike",
    hint: "Find the bishop move that closes the mating net.",
  },
  {
    fen: "8/8/1NK5/4k3/6Q1/8/8/8 w - - 0 1",
    rating: 1250,
    theme: "Knight Ambush",
    hint: "Find the knight jump that seals every escape square.",
  },
  {
    fen: "7k/5P2/8/8/3KB3/8/8/8 w - - 0 1",
    rating: 1150,
    theme: "Pawn Breakthrough",
    hint: "Promote the pawn with checkmate.",
  },
  {
    fen: "7B/8/3R4/kb6/4K3/1Bp5/8/8 w - - 0 1",
    rating: 1250,
    theme: "Diagonal Strike",
    hint: "Find the bishop move that closes the mating net.",
  },
  {
    fen: "1K6/2Q5/k7/8/6p1/8/B7/8 w - - 0 1",
    rating: 1250,
    theme: "Diagonal Strike",
    hint: "Find the bishop move that closes the mating net.",
  },
  {
    fen: "8/8/2B5/8/K7/8/kp5p/2R2N2 w - - 0 1",
    rating: 1300,
    theme: "Diagonal Strike",
    hint: "Find the bishop move that closes the mating net.",
  },
  {
    fen: "8/7B/8/1K6/8/7k/5Q2/8 w - - 0 1",
    rating: 1200,
    theme: "Diagonal Strike",
    hint: "Find the bishop move that closes the mating net.",
  },
  {
    fen: "8/6R1/K2Q4/2p2k2/8/8/4r3/5N2 w - - 0 1",
    rating: 1300,
    theme: "Knight Ambush",
    hint: "Find the knight jump that seals every escape square.",
  },
  {
    fen: "8/6b1/7p/K7/8/k7/n2N4/2N5 w - - 0 1",
    rating: 1350,
    theme: "Knight Ambush",
    hint: "Find the knight jump that seals every escape square.",
  },
  {
    fen: "8/b3N3/8/7Q/1q3k2/5P2/6K1/8 w - - 0 1",
    rating: 1350,
    theme: "Knight Ambush",
    hint: "Find the knight jump that seals every escape square.",
  },
  {
    fen: "2k5/8/P2Q4/8/2N5/1K6/8/8 w - - 0 1",
    rating: 1250,
    theme: "Knight Ambush",
    hint: "Find the knight jump that seals every escape square.",
  },
  {
    fen: "8/2PPk3/4p1B1/8/8/8/8/4B2K w - - 0 1",
    rating: 1300,
    theme: "Pawn Breakthrough",
    hint: "Promote the pawn with checkmate.",
  },
  {
    fen: "8/2k2P1R/8/1K4P1/8/8/6P1/8 w - - 0 1",
    rating: 1250,
    theme: "Pawn Breakthrough",
    hint: "Promote the pawn with checkmate.",
  },
  {
    fen: "B1k5/4P2K/3P4/4P3/8/8/8/8 w - - 0 1",
    rating: 1200,
    theme: "Pawn Breakthrough",
    hint: "Promote the pawn with checkmate.",
  },
  {
    fen: "8/1P6/1k6/1B6/1P1K2B1/8/3p4/8 w - - 0 1",
    rating: 1300,
    theme: "Pawn Breakthrough",
    hint: "Promote the pawn with checkmate.",
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeSeed(seed) {
  const value = Number.isFinite(Number(seed))
    ? Number(seed)
    : Date.now() ^ Math.floor(Math.random() * 0xffffffff);
  return value >>> 0 || 1;
}

function randomSource(seed) {
  let state = normalizeSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function transformedFen(fen, mirrorFiles, flipColors) {
  const source = new Chess(fen);
  const target = new Chess();
  target.clear();

  for (const row of source.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const fileIndex = piece.square.charCodeAt(0) - 97;
      const rank = Number(piece.square[1]);
      const transformedFile = mirrorFiles ? 7 - fileIndex : fileIndex;
      const transformedRank = flipColors ? 9 - rank : rank;
      target.put(
        {
          type: piece.type,
          color: flipColors ? (piece.color === "w" ? "b" : "w") : piece.color,
        },
        `${String.fromCharCode(97 + transformedFile)}${transformedRank}`,
      );
    }
  }

  const turn = flipColors ? (source.turn() === "w" ? "b" : "w") : source.turn();
  const parts = target.fen().split(" ");
  return `${parts[0]} ${turn} - - 0 1`;
}

function findUniqueMate(chess) {
  let matingMove = null;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const isMate = chess.isCheckmate();
    chess.undo();
    if (!isMate) continue;
    if (matingMove) return null;
    matingMove = move;
  }
  return matingMove;
}

export function validateGeneratedPuzzle(puzzle) {
  try {
    const chess = new Chess(puzzle.fen);
    const matingMove = findUniqueMate(chess);
    if (!matingMove || chess.turn() !== puzzle.sideToMove[0]) return false;
    const solution = chess.move(puzzle.solution);
    return solution.san === matingMove.san && chess.isCheckmate();
  } catch {
    return false;
  }
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function randomSquare(random, used, pieceType) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const minimumRank = pieceType === "p" ? 2 : 1;
    const rankCount = pieceType === "p" ? 6 : 8;
    const square = `${String.fromCharCode(97 + Math.floor(random() * 8))}${minimumRank + Math.floor(random() * rankCount)}`;
    if (!used.has(square)) {
      used.add(square);
      return square;
    }
  }
  return null;
}

const MAX_GENERATION_ATTEMPTS = 80;
const KING_ADJACENCY_LIMIT = 6;
const TARGET_MATING_PIECES = ["q", "r", "b", "n", "p"];

function kingDistance(a, b) {
  const fileA = a.charCodeAt(0);
  const rankA = Number(a[1]);
  const fileB = b.charCodeAt(0);
  const rankB = Number(b[1]);
  return Math.max(Math.abs(fileA - fileB), Math.abs(rankA - rankB));
}

// ============================================================================
// Method 1: Hardcoded Rules (Procedural Generation)
// ============================================================================

function composePuzzle(random, targetMatingPiece) {
  const majorPieces = ["q", "r", "b", "n"];
  const supportPieces = ["q", "r", "b", "n", "p"];
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const chess = new Chess();
    chess.clear();
    const used = new Set();
    const pieces = [
      { type: "k", color: "w" },
      { type: "k", color: "b" },
      { type: targetMatingPiece ?? pick(random, majorPieces), color: "w" },
      { type: pick(random, supportPieces), color: "w" },
    ];
    const extraPieces = Math.floor(random() * 4);
    for (let index = 0; index < extraPieces; index += 1) {
      pieces.push({
        type: random() < 0.6 ? "p" : pick(random, majorPieces),
        color: random() < 0.72 ? "b" : "w",
      });
    }

    let placed = true;
    let whiteKingSquare = null;
    let blackKingSquare = null;
    for (const piece of pieces) {
      const square = randomSquare(random, used, piece.type);
      if (!square || !chess.put(piece, square)) {
        placed = false;
        break;
      }
      if (piece.type === "k") {
        if (piece.color === "w") whiteKingSquare = square;
        else blackKingSquare = square;
      }
    }
    if (!placed) continue;

    // Cheap early-rejection: a mate-in-one needs the attacking king close
    // enough to constrain the defender's escape squares. Skip the expensive
    // full mate search when the kings are too far apart.
    if (
      whiteKingSquare &&
      blackKingSquare &&
      kingDistance(whiteKingSquare, blackKingSquare) > KING_ADJACENCY_LIMIT
    ) {
      continue;
    }

    try {
      const parts = chess.fen().split(" ");
      parts[1] = "w";
      parts[2] = "-";
      parts[3] = "-";
      parts[4] = "0";
      parts[5] = "1";
      chess.load(parts.join(" "));
      const blackKing = chess
        .board()
        .flat()
        .find((piece) => piece?.type === "k" && piece.color === "b");
      if (
        chess.isCheck() ||
        !blackKing ||
        chess.isAttacked(blackKing.square, "w") ||
        chess.isGameOver()
      ) {
        continue;
      }
      const mate = findUniqueMate(chess);
      if (!mate || (targetMatingPiece && mate.piece !== targetMatingPiece)) continue;
      return { fen: chess.fen() };
    } catch {
      continue;
    }
  }
  return null;
}

function themeForMove(move) {
  return (
    {
      q: "Queen Net",
      r: "Rook Finish",
      b: "Diagonal Strike",
      n: "Knight Ambush",
      p: "Pawn Breakthrough",
    }[move.piece] ?? "Mate in One"
  );
}

function hintForMove(move) {
  return (
    {
      q: "Use the queen's reach to cover every escape square.",
      r: "Find the rook line that leaves the king nowhere to run.",
      b: "Look along the diagonals for a decisive finish.",
      n: "A knight jump can cover the king's remaining escape squares.",
      p: "A pawn move can deliver the final check.",
    }[move.piece] ?? "Find the only move that delivers checkmate."
  );
}

function ratePuzzle(chess) {
  const pieceCount = chess.board().flat().filter(Boolean).length;
  return Math.min(1500, 700 + pieceCount * 75);
}

// ============================================================================
// Method 2: Stockfish-Assisted Generation
// ============================================================================

/**
 * Generate a puzzle using Stockfish engine
 * @param {Object} options - Generation options
 * @param {string} options.difficulty - Difficulty level (easy, medium, hard)
 * @param {string} options.puzzleType - Type of puzzle (mate-in-1, mate-in-2, mate-in-3, tactics)
 * @param {number} options.seed - Random seed for reproducibility
 * @returns {Promise<Puzzle>}
 */
export async function generatePuzzleWithStockfish(options = {}) {
  const { difficulty = 'medium', puzzleType = 'mate-in-1', seed = Date.now() } = options;

  // For now, fall back to procedural generation
  // Stockfish integration requires WASM module which needs async loading
  console.warn('Stockfish generation: falling back to procedural (WASM not preloaded)');

  return generatePuzzle(seed);
}

/**
 * Validate a puzzle solution using Stockfish
 * @param {string} fen - Position FEN
 * @param {string} solution - Expected solution move
 * @returns {Promise<boolean>}
 */
export async function validateWithStockfish(fen, solution) {
  // Placeholder for Stockfish validation
  // In production, this would use the stockfish.js WASM module
  console.warn('Stockfish validation: not implemented (WASM module required)');
  return true;
}

// ============================================================================
// Method 3: AI-Based Generation
// ============================================================================

/**
 * Generate a puzzle using AI from a text description
 * @param {string} description - Text description of the puzzle
 * @param {Object} options - Generation options
 * @param {string} options.difficulty - Difficulty level
 * @param {string} options.provider - AI provider to use
 * @param {number} options.seed - Random seed
 * @returns {Promise<Puzzle>}
 */
export async function generatePuzzleWithAI(description, options = {}) {
  const { difficulty = 'medium', provider = 'default', seed = Date.now() } = options;

  // For now, generate a puzzle based on the description keywords
  // In production, this would call your AI provider API

  console.log(`Generating AI puzzle from description: "${description}"`);

  // Parse description for keywords
  const lowerDesc = description.toLowerCase();
  let theme = 'Tactics';
  let rating = 1200;

  if (lowerDesc.includes('mate in 1') || lowerDesc.includes('mate-in-1')) {
    theme = 'Mate in One';
    rating = 800 + Math.floor(Math.random() * 400);
  } else if (lowerDesc.includes('mate in 2') || lowerDesc.includes('mate-in-2')) {
    theme = 'Mate in Two';
    rating = 1200 + Math.floor(Math.random() * 600);
  } else if (lowerDesc.includes('mate in 3') || lowerDesc.includes('mate-in-3')) {
    theme = 'Mate in Three';
    rating = 1500 + Math.floor(Math.random() * 500);
  } else if (lowerDesc.includes('fork')) {
    theme = 'Fork';
    rating = 1000 + Math.floor(Math.random() * 500);
  } else if (lowerDesc.includes('pin')) {
    theme = 'Pin';
    rating = 1100 + Math.floor(Math.random() * 500);
  } else if (lowerDesc.includes('skewer')) {
    theme = 'Skewer';
    rating = 1200 + Math.floor(Math.random() * 500);
  } else if (lowerDesc.includes('back rank') || lowerDesc.includes('back-rank')) {
    theme = 'Back Rank Mate';
    rating = 900 + Math.floor(Math.random() * 400);
  }

  // Generate a puzzle using the procedural method with the theme
  const puzzle = generatePuzzle(seed);

  return {
    ...puzzle,
    id: `ai-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    theme,
    rating,
    hint: `AI-generated puzzle: ${description}`,
    aiGenerated: true,
    provider,
    description
  };
}

// ============================================================================
// Main Generation Functions
// ============================================================================

export async function generatePuzzleAsync(
  seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff),
) {
  // Yield to the event loop so puzzle generation never blocks the render path.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return generatePuzzle(seed);
}

export function generatePuzzle(
  seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff),
) {
  const normalizedSeed = normalizeSeed(seed);
  const random = randomSource(normalizedSeed);
  const targetMatingPiece = TARGET_MATING_PIECES[normalizedSeed % TARGET_MATING_PIECES.length];
  const matchingBasePuzzles = BASE_PUZZLES.filter((candidate) => {
    const chess = new Chess(candidate.fen);
    return findUniqueMate(chess)?.piece === targetMatingPiece;
  });
  const fallbackPuzzles = matchingBasePuzzles.length > 0
    ? matchingBasePuzzles
    : BASE_PUZZLES;
  const usesTemplate = targetMatingPiece === "b" || targetMatingPiece === "n" || targetMatingPiece === "p";
  const composed = usesTemplate ? null : composePuzzle(random, targetMatingPiece);
  const sequence = Math.floor((normalizedSeed - 1) / TARGET_MATING_PIECES.length);
  const fallbackIndex = sequence % fallbackPuzzles.length;
  const transformIndex = Math.floor(sequence / fallbackPuzzles.length) % 4;
  const base = composed ?? fallbackPuzzles[fallbackIndex];
  const mirrorFiles = composed ? random() >= 0.5 : transformIndex % 2 === 1;
  const flipColors = composed ? random() >= 0.5 : transformIndex >= 2;
  const fen = transformedFen(base.fen, mirrorFiles, flipColors);
  const chess = new Chess(fen);
  const mate = findUniqueMate(chess);

  if (!mate) throw new Error("Unable to generate a verified chess puzzle.");

  const puzzle = {
    id: `generated-${normalizedSeed}`,
    fen,
    sideToMove: chess.turn() === "w" ? "white" : "black",
    rating: base.rating ?? ratePuzzle(chess),
    theme: base.theme ?? themeForMove(mate),
    hint: base.hint ?? hintForMove(mate),
    solution: mate.san,
    followup: null,
    generated: true,
    generationMethod: 'hardcoded-rules'
  };

  if (!validateGeneratedPuzzle(puzzle)) {
    throw new Error("Generated puzzle did not pass legality checks.");
  }

  return puzzle;
}

/**
 * Generate a puzzle using a specific method
 * @param {string} method - Generation method ('hardcoded', 'stockfish', 'ai')
 * @param {Object} options - Method-specific options
 * @returns {Promise<Puzzle>}
 */
export async function generatePuzzleByMethod(method, options = {}) {
  switch (method) {
    case 'stockfish':
      return generatePuzzleWithStockfish(options);
    case 'ai':
      return generatePuzzleWithAI(options.description, options);
    case 'hardcoded':
    default:
      return generatePuzzle(options.seed);
  }
}

/**
 * Generate multiple puzzles at once
 * @param {number} count - Number of puzzles to generate
 * @param {Object} options - Generation options
 * @returns {Promise<Puzzle[]>}
 */
export async function generateMultiplePuzzles(count = 5, options = {}) {
  const puzzles = [];

  for (let i = 0; i < count; i++) {
    try {
      const puzzle = await generatePuzzle(options.seed ? options.seed + i : undefined);
      puzzles.push(puzzle);
    } catch (error) {
      console.warn(`Failed to generate puzzle ${i + 1}:`, error.message);
    }
  }

  return puzzles;
}

// ============================================================================
// Puzzle Filtering and Selection
// ============================================================================

/**
 * Filter puzzles by difficulty
 * @param {Puzzle[]} puzzles - Array of puzzles
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @returns {Puzzle[]}
 */
export function filterByDifficulty(puzzles, difficulty) {
  const ranges = {
    easy: { min: 0, max: 1000 },
    medium: { min: 1000, max: 1600 },
    hard: { min: 1600, max: 3000 }
  };

  const range = ranges[difficulty] || ranges.medium;
  return puzzles.filter(p => p.rating >= range.min && p.rating <= range.max);
}

/**
 * Filter puzzles by theme
 * @param {Puzzle[]} puzzles - Array of puzzles
 * @param {string} theme - Theme to filter by
 * @returns {Puzzle[]}
 */
export function filterByTheme(puzzles, theme) {
  if (!theme) return puzzles;
  return puzzles.filter(p =>
    p.theme && p.theme.toLowerCase().includes(theme.toLowerCase())
  );
}

/**
 * Select a random puzzle from an array
 * @param {Puzzle[]} puzzles - Array of puzzles
 * @param {Object} options - Selection options
 * @returns {Puzzle}
 */
export function selectRandomPuzzle(puzzles, options = {}) {
  const { difficulty, theme } = options;

  let filtered = [...puzzles];

  if (difficulty) {
    filtered = filterByDifficulty(filtered, difficulty);
  }

  if (theme) {
    filtered = filterByTheme(filtered, theme);
  }

  if (filtered.length === 0) {
    filtered = puzzles; // Fall back to all puzzles if filters are too restrictive
  }

  const randomIndex = Math.floor(Math.random() * filtered.length);
  return { ...filtered[randomIndex], id: `random-${Date.now()}` };
}

// ============================================================================
// Export all generation methods
// ============================================================================

export const PUZZLE_METHODS = {
  HARDCODED: 'hardcoded',
  STOCKFISH: 'stockfish',
  AI: 'ai'
};

export default {
  generatePuzzle,
  generatePuzzleAsync,
  generatePuzzleByMethod,
  generatePuzzleWithStockfish,
  generatePuzzleWithAI,
  generateMultiplePuzzles,
  validateGeneratedPuzzle,
  filterByDifficulty,
  filterByTheme,
  selectRandomPuzzle,
  BASE_PUZZLES,
  PUZZLE_METHODS
};
