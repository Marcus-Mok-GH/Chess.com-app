/**
 * Brilliancy detection for the Mr. Brilliant personality.
 *
 * Chess.com hands out the "!!" when a move gives up material *and* is still
 * (one of) the best moves in the position. We approximate that here without a
 * second engine call:
 *
 *  - the engine reports the top root moves with their scores (MultiPV), and
 *  - a capture-only search from the resulting position estimates how much
 *    material the move actually hands over, net of any compensation we can
 *    grab straight back.
 *
 * A candidate is "brilliant" when the sacrifice is at least a pawn's worth and
 * its score stays within a small tolerance of the best move. The chosen move is
 * the largest affordable sacrifice, so the bot plays the flashiest sound move
 * on the board rather than merely the strongest one.
 *
 * Everything here is pure and stateless: the same FEN and candidate list always
 * produce the same pick, which keeps undo/redo and restored games consistent.
 */

import { Chess } from 'chess.js';

/** Centipawn material values (king included so lookups never return undefined). */
export const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** Stockfish mate scores are folded into this value by the engine worker. */
export const MATE_SCORE_CP = 100000;

/** How far below the best move a sacrifice may sit and still count as sound. */
const DEFAULT_SCORE_TOLERANCE_CP = 60;

/** A pawn's worth: smaller "sacrifices" are just normal exchanges. */
const DEFAULT_MIN_SACRIFICE_CP = 100;

/** Plies of capture-only search used to price the material given away. */
const CAPTURE_SEARCH_DEPTH = 3;

const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;

/** Apply a UCI move to a position, returning the applied move or null. */
export function applyUciMove(chess, uci) {
  if (typeof uci !== 'string' || !UCI_MOVE_REGEX.test(uci)) return null;
  try {
    return (
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci.slice(4, 5).toLowerCase() } : {}),
      }) || null
    );
  } catch {
    return null;
  }
}

function promotionBonus(move) {
  if (!move?.promotion) return 0;
  return (PIECE_VALUES[move.promotion] ?? 0) - PIECE_VALUES.p;
}

/**
 * Best net material (centipawns) the side to move can win with a capture-only
 * sequence, from that side's point of view. Standing pat is always allowed, so
 * the result is never negative.
 */
export function bestCaptureGain(chess, depth = CAPTURE_SEARCH_DEPTH) {
  if (depth <= 0) return 0;
  let best = 0;
  for (const move of chess.moves({ verbose: true })) {
    if (!move.captured) continue;
    const gained = (PIECE_VALUES[move.captured] ?? 0) + promotionBonus(move);
    const applied = chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
    if (!applied) continue;
    const reply = bestCaptureGain(chess, depth - 1);
    chess.undo();
    const net = gained - reply;
    if (net > best) best = net;
  }
  return best;
}

/**
 * Material the move hands over, net of anything it wins immediately: the
 * opponent's best capture sequence minus our own capture/promotion gain.
 * Positive values mean the move is a sacrifice.
 */
export function materialGivenAway(chess, appliedMove, captureDepth = CAPTURE_SEARCH_DEPTH) {
  const ownGain = (appliedMove?.captured ? PIECE_VALUES[appliedMove.captured] ?? 0 : 0) + promotionBonus(appliedMove);
  const opponentGain = bestCaptureGain(chess, captureDepth);
  return opponentGain - ownGain;
}

/**
 * Judge a single candidate move for brilliancy.
 *
 * @param {string} fen - Position before the move.
 * @param {string} uci - Candidate move in UCI form.
 * @param {object} [options]
 * @param {number} [options.score] - Engine score for the move (side to move's view).
 * @param {number} [options.bestScore] - Engine score of the position's best move.
 * @param {number} [options.scoreTolerance] - Max centipawns below bestScore.
 * @param {number} [options.minSacrifice] - Minimum material given away.
 * @returns {{ brilliant: boolean, move: string, san?: string, sacrifice: number, reason: string }}
 */
export function evaluateBrilliance(fen, uci, options = {}) {
  const {
    score = null,
    bestScore = null,
    scoreTolerance = DEFAULT_SCORE_TOLERANCE_CP,
    minSacrifice = DEFAULT_MIN_SACRIFICE_CP,
    captureDepth = CAPTURE_SEARCH_DEPTH,
  } = options;

  const rejected = (reason) => ({ brilliant: false, move: uci, sacrifice: 0, reason });

  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return rejected('invalid-fen');
  }

  const applied = applyUciMove(chess, uci);
  if (!applied) return rejected('illegal-move');

  // A mating move is the strongest move, not a sacrifice — leave it to the
  // engine's own best move.
  if (chess.isCheckmate()) return rejected('checkmate');

  const comparable = Number.isFinite(score) && Number.isFinite(bestScore);
  if (comparable && score < bestScore - scoreTolerance) return rejected('worse-than-best-move');

  const sacrifice = materialGivenAway(chess, applied, captureDepth);
  if (sacrifice < minSacrifice) return rejected('no-sacrifice');

  return { brilliant: true, move: uci, san: applied.san, sacrifice, reason: 'sacrifice' };
}

/**
 * Pick the move for a brilliancy-hunting bot from the engine's scored
 * candidates. Returns `null` when there is nothing to choose from, otherwise
 * `{ move, brilliant, reason, sacrifice, score }`:
 *
 *  - a forced mate is always played as-is,
 *  - otherwise the largest affordable sacrifice wins,
 *  - and when no candidate sacrifices anything, the engine's best move stands.
 */
export function selectBrilliantMove(fen, candidates, options = {}) {
  const {
    scoreTolerance = DEFAULT_SCORE_TOLERANCE_CP,
    minSacrifice = DEFAULT_MIN_SACRIFICE_CP,
    captureDepth = CAPTURE_SEARCH_DEPTH,
  } = options;

  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate.move === 'string' && Number.isFinite(Number(candidate.score)))
    .map((candidate) => ({
      move: candidate.move,
      score: Number(candidate.score),
      depth: Number(candidate.depth) || 0,
    }))
    .sort((a, b) => b.score - a.score || b.depth - a.depth);

  if (ranked.length === 0) return null;

  const best = ranked[0];
  if (best.score >= MATE_SCORE_CP - 1) {
    return { move: best.move, brilliant: false, reason: 'mate', sacrifice: 0, score: best.score };
  }

  const sacrificial = [];
  for (const candidate of ranked) {
    const verdict = evaluateBrilliance(fen, candidate.move, {
      score: candidate.score,
      bestScore: best.score,
      scoreTolerance,
      minSacrifice,
      captureDepth,
    });
    if (verdict.brilliant) sacrificial.push({ ...candidate, sacrifice: verdict.sacrifice });
  }

  if (sacrificial.length === 0) {
    return { move: best.move, brilliant: false, reason: 'no-sacrifice-available', sacrifice: 0, score: best.score };
  }

  sacrificial.sort((a, b) => b.sacrifice - a.sacrifice || b.score - a.score);
  const chosen = sacrificial[0];

  return {
    move: chosen.move,
    brilliant: true,
    reason: 'sacrifice',
    sacrifice: chosen.sacrifice,
    score: chosen.score,
    alternatives: sacrificial.slice(1).map(({ move, score, sacrifice }) => ({ move, score, sacrifice })),
  };
}

export default { selectBrilliantMove, evaluateBrilliance, materialGivenAway, bestCaptureGain, applyUciMove };
