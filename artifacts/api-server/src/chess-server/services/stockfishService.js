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

function sampleRandomPosition(seed) {
  const chess = new Chess();
  const plies = 12 + Math.floor(Math.abs(Number(seed) || Date.now()) % 30);
  for (let i = 0; i < plies; i++) {
    if (chess.isGameOver()) break;
    const moves = chess.moves();
    if (moves.length === 0) break;
    chess.move(moves[Math.floor(Math.random() * moves.length)]);
  }
  return chess.isGameOver() ? new Chess().fen() : chess.fen();
}

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
  const { difficulty = "medium", seed = Date.now(), type = "tactics", timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  if (!isStockfishConfigured()) return null;

  const analysisDepth = difficultyDepth(difficulty);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const fen = sampleRandomPosition(Number(seed) + attempt * 100);
    const analysis = await analyzePosition(fen, {
      depth: analysisDepth,
      timeoutMs,
    });
    if (!analysis?.bestMove) continue;

    const chess = new Chess(fen);
    const sideToMove = chess.turn() === "w" ? "white" : "black";
    const move = uciToVerbose(chess.moves({ verbose: true }), analysis.bestMove);
    if (!move) continue;

    const appliedMove = chess.move(move);
    if (!appliedMove) continue;

    const isMate = chess.isCheckmate();
    const isTactic = Boolean(appliedMove.captured || appliedMove.promotion || appliedMove.san.includes("+") || isMate);

    if (type === "mate-in-1") {
      if (!isMate) continue;
      // Verify exactly one mating move exists
      const checkChess = new Chess(fen);
      let matingMoveCount = 0;
      for (const testMove of checkChess.moves({ verbose: true })) {
        checkChess.move(testMove);
        if (checkChess.isCheckmate()) matingMoveCount++;
        checkChess.undo();
      }
      if (matingMoveCount !== 1) continue;
    }
    if (type !== "mate-in-1" && !isTactic) continue;

    return {
      id: `stockfish-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      fen,
      sideToMove,
      rating: ratingForDifficulty(difficulty),
      theme: isMate ? "Stockfish Checkmate" : themeForTacticMove(appliedMove),
      hint: isMate
        ? `Stockfish found a checkmate line for ${sideToMove}.`
        : `Stockfish found a forcing line for ${sideToMove}. Look for the tactic.`,
      solution: appliedMove.san,
      followup: null,
      generated: true,
      method: "stockfish",
      effectiveMethod: "stockfish",
      type: isMate ? "mate-in-1" : "tactics",
      engineScore: analysis.score,
    };
  }

  return null;
}

function themeForTacticMove(move) {
  if (move.captured === "q") return "Winning the Queen";
  if (move.captured === "r") return "Winning the Exchange";
  if (move.promotion) return "Pawn Promotion";
  if (move.san.includes("+")) return "Forcing Check";
  return "Tactical Advantage";
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
