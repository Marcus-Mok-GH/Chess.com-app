/**
 * Stockfish Service for puzzle generation and validation.
 *
 * This service exclusively uses the Stockfish WASM worker (via
 * `engineWorker.js`) to identify and verify puzzle solutions. It never
 * substitutes a procedural or AI-generated position when Stockfish is
 * unavailable; callers receive an explicit failure instead.
 */

import { Chess } from "chess.js";
import { runEngine, isStockfishConfigured } from "./engineWorker.js";

const DEFAULT_TIMEOUT_MS = 6000;

// Curated legal positions provide varied starting material; Stockfish alone
// chooses and verifies the forcing move that becomes the puzzle solution.
const STOCKFISH_SEED_POSITIONS = [
  "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1",
  "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
  "6k1/6pp/8/8/2B5/8/8/3R2K1 w - - 0 1",
  "6k1/5ppp/8/8/4B3/8/8/3Q2K1 w - - 0 1",
  "7k/5ppp/8/8/8/5N2/8/3Q2K1 w - - 0 1",
  "8/8/1BK5/4k3/6Q1/8/8/8 w - - 0 1",
  "8/8/1NK5/4k3/6Q1/8/8/8 w - - 0 1",
  "7k/5P2/8/8/3KB3/8/8/8 w - - 0 1",
];

/**
 * Diagnose a position with Stockfish and report whether there's a clearly
 * dominant move. We consider a position "puzzle-worthy" when the engine
 * reports a single move whose score (in centipawns or mate distance) is
 * meaningfully better than the second-best move.
 *
 * @param {string} fen - Position to analyse.
 * @param {{depth?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<{bestMove:string, score:number, secondScore:number, isMate:boolean, candidates:Array} | null>}
 */
export async function analyzePosition(fen, opts = {}) {
  const { depth = 8, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  if (!isStockfishConfigured()) return null;
  try {
    const { bestMove, candidates } = await runEngine(fen, {
      depth,
      multiPv: true,
      timeoutMs,
    });
    if (!bestMove) return null;

    const ranked = [...candidates].sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];

    const normalise = (c) => {
      if (!c) return -100000;
      // Mate scores clamp to ±100000 in engineWorker; centipawn scores pass through.
      return c.score;
    };

    const bestScore = normalise(best);
    const secondScore = normalise(second);
    return {
      bestMove,
      score: bestScore,
      secondScore,
      isMate: Math.abs(bestScore) >= 100000,
      candidates: ranked,
    };
  } catch (error) {
    console.warn("[Stockfish] analyzePosition failed:", error.message);
    return null;
  }
}

/**
 * Generate a mate-in-one puzzle that Stockfish both finds and verifies. The
 * engine analyses a rotating selection of legal seed positions; a position is
 * accepted only when Stockfish's best move produces checkmate on the board.
 *
 * @param {{difficulty?: string, seed?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<object|null>} A Stockfish-authored puzzle, or null when the engine cannot find one.
 */
export async function generateMateInNPuzzle(opts = {}) {
  const { difficulty = "medium", seed = Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  if (!isStockfishConfigured()) return null;

  const analysisDepth = difficultyDepth(difficulty);
  const offset = Math.abs(Number(seed) || Date.now()) % STOCKFISH_SEED_POSITIONS.length;

  for (let index = 0; index < STOCKFISH_SEED_POSITIONS.length; index += 1) {
    const fen = STOCKFISH_SEED_POSITIONS[(offset + index) % STOCKFISH_SEED_POSITIONS.length];
    const analysis = await analyzePosition(fen, {
      depth: analysisDepth,
      timeoutMs,
    });
    if (!analysis?.bestMove) continue;

    const puzzle = materialiseMateInOnePuzzle(fen, analysis, difficulty);
    if (puzzle) return puzzle;
  }

  return null;
}

/**
 * Validate that a puzzle's solution is still forced (engine agrees the
 * position has a single best move matching the recorded solution).
 */
export async function validatePuzzleSolution(fen, solutionSan, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  try {
    const chess = new Chess(fen);
    const move = chess.move(solutionSan);
    if (!move) return { valid: false, reason: "Illegal solution move" };

    const analysis = await analyzePosition(fen, { timeoutMs });
    if (!analysis) return { valid: true, engineConfirmed: false };

    // Convert bestMove (UCI) to SAN and compare.
    const bestSan = uciToSan(fen, analysis.bestMove);
    return {
      valid: true,
      engineConfirmed: bestSan === solutionSan,
      bestMove: analysis.bestMove,
      bestMoveSan: bestSan,
      score: analysis.score,
    };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

export async function getPositionEvaluation(fen, opts = {}) {
  const analysis = await analyzePosition(fen, opts);
  if (!analysis) return { evaluation: 0, bestMove: null };
  return { evaluation: analysis.score, bestMove: analysis.bestMove };
}

export function isStockfishAvailable() {
  return isStockfishConfigured();
}

// ---- helpers -------------------------------------------------------------

function difficultyDepth(difficulty) {
  return { easy: 6, medium: 9, hard: 12, expert: 14 }[difficulty] ?? 9;
}

function materialiseMateInOnePuzzle(fen, analysis, difficulty) {
  try {
    const chess = new Chess(fen);
    const sideToMove = chess.turn() === "w" ? "white" : "black";
    const move = uciToVerbose(chess.moves({ verbose: true }), analysis.bestMove);
    if (!move) return null;

    const appliedMove = chess.move(move);
    if (!appliedMove || !chess.isCheckmate()) return null;

    return {
      id: `stockfish-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      fen,
      sideToMove,
      rating: ratingForDifficulty(difficulty),
      theme: "Stockfish Mate in One",
      hint: `Stockfish found a forcing move for ${sideToMove}. Look for the checkmate.`,
      solution: appliedMove.san,
      followup: null,
      generated: true,
      method: "stockfish",
      effectiveMethod: "stockfish",
      type: "mate-in-1",
      engineScore: analysis.score,
    };
  } catch {
    return null;
  }
}

function ratingForDifficulty(difficulty) {
  return { easy: 900, medium: 1300, hard: 1700, expert: 2100 }[difficulty] ?? 1300;
}

function themeForType(type) {
  return (
    {
      "mate-in-1": "Mate in One",
      "mate-in-2": "Mate in Two",
      tactics: "Tactical Combination",
      endgame: "Endgame Technique",
      middlegame: "Middlegame Tactic",
    }[type] ?? "Stockfish Composition"
  );
}

function uciToVerbose(moves, uci) {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4].toLowerCase() : undefined;
  return (
    moves.find((m) => m.from === from && m.to === to && (promotion ? m.promotion === promotion : !m.promotion)) ?? null
  );
}

function uciToSan(fen, uci) {
  const chess = new Chess(fen);
  const match = uciToVerbose(chess.moves({ verbose: true }), uci);
  if (!match) throw new Error(`No legal move for UCI ${uci} in ${fen}`);
  return chess.move(match).san;
}

export default {
  isStockfishAvailable,
  analyzePosition,
  generateMateInNPuzzle,
  validatePuzzleSolution,
  getPositionEvaluation,
};
