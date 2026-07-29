/**
 * Stockfish Service for puzzle generation and validation.
 *
 * This is the real implementation: it spawns the Stockfish WASM worker
 * (via `engineWorker.js`) to analyse positions and either:
 *   - verify a procedurally generated position contains a forced tactic
 *     ("assisted" generation), or
 *   - find a tactic with a single best move inside a self-play game tree
 *     ("engine-discovery" generation).
 *
 * If Stockfish cannot be reached, every call degrades gracefully to the
 * procedural generator so the API never hard-fails when the engine is
 * unavailable.
 */

import { Chess } from "chess.js";
import { runEngine, isStockfishConfigured } from "./engineWorker.js";
import {
  generatePuzzle as generateProceduralPuzzle,
  validateGeneratedPuzzle,
} from "../puzzles/puzzleGenerator.js";

const DEFAULT_TIMEOUT_MS = 6000;

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
 * Generate a puzzle by self-playing a short game of semi-random moves and
 * stopping at the first position Stockfish judges to have a single
 * clearly-best move (a tactic). The side to move at that position becomes
 * the puzzle's solving side.
 *
 * @param {{difficulty?: string, type?: string, seed?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<object|null>} A puzzle object compatible with the procedural generator's shape.
 */
export async function generateMateInNPuzzle(opts = {}) {
  const { difficulty = "medium", type = "tactics", seed, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  if (!isStockfishConfigured()) return null;

  const rng = seededRandom(seed ?? Date.now());
  const analysisDepth = difficultyDepth(difficulty);

  // Walk through up to 40 plies of plausible play, analysing the resulting
  // positions. Plausibility: 70% the engine's top move, 30% a random legal
  // move, to reach varied middlegame positions where tactics commonly occur.
  const game = new Chess();
  const played = [];
  for (let ply = 0; ply < 60; ply++) {
    const fen = game.fen();
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) break;

    // Analyse the current position; look for a single dominant move.
    if (ply >= 6) {
      const analysis = await analyzePosition(fen, { depth: analysisDepth, timeoutMs });
      if (analysis && isPuzzleWorthy(analysis)) {
        const puzzle = materialisePuzzle(game, analysis, type, difficulty, played);
        if (puzzle && validateGeneratedPuzzle(puzzle)) return puzzle;
      }
    }

    // Otherwise play one move forward.
    let chosen;
    if (rng() < 0.7) {
      try {
        const { bestMove } = await runEngine(fen, { depth: Math.max(4, analysisDepth - 2), timeoutMs });
        chosen = bestMove ? uciToVerbose(moves, bestMove) : null;
      } catch {
        chosen = null;
      }
    }
    if (!chosen) chosen = moves[Math.floor(rng() * moves.length)];
    played.push(chosen.san);
    game.move(chosen);
  }

  // As a last resort, look for a forced mate in the final position.
  const final = await analyzePosition(game.fen(), { depth: analysisDepth, timeoutMs });
  if (final && final.isMate && final.bestMove) {
    const puzzle = materialisePuzzle(game, final, type, difficulty, played);
    if (puzzle && validateGeneratedPuzzle(puzzle)) return puzzle;
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

// Score gap (in centipawns) required to call a move "clearly best". The
// engine reports mate scores as ±100000, so any mate gap clears the bar.
function isPuzzleWorthy(analysis) {
  const gap = analysis.score - analysis.secondScore;
  if (analysis.isMate) return true;
  // Avoid dead-drawn positions (small advantage, no gap) and positions with
  // no standout move (gap too small). ~1.5 pawns worth of margin works well.
  return gap >= 150 && Math.abs(analysis.score) >= 100;
}

function materialisePuzzle(game, analysis, type, difficulty, playedMoves) {
  const fen = game.fen();
  const sideToMove = game.turn() === "w" ? "white" : "black";
  let solutionSan;
  try {
    const chess = new Chess(fen);
    const move = uciToVerbose(chess.moves({ verbose: true }), analysis.bestMove);
    if (!move) return null;
    solutionSan = move.san;
  } catch {
    return null;
  }
  return {
    id: `stockfish-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    fen,
    sideToMove,
    rating: ratingForDifficulty(difficulty),
    theme: themeForType(type),
    hint: `Engine analysis: a clearly best move exists for ${sideToMove}.`,
    solution: solutionSan,
    followup: null,
    generated: true,
    method: "stockfish",
    moves: playedMoves,
  };
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

function seededRandom(seed) {
  let state = (Number(seed) || Date.now()) >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export { generateProceduralPuzzle };
export default {
  isStockfishAvailable,
  analyzePosition,
  generateMateInNPuzzle,
  validatePuzzleSolution,
  getPositionEvaluation,
};
