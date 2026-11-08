/**
 * Stall detection for the Stallfish personality.
 *
 * Stallfish wants the game to never end, so every candidate move is judged
 * by how alive it keeps the position:
 *
 *  Hard vetoes — a move is rejected outright when it ends the game or hands
 *  the opponent an immediate ending:
 *   - delivering checkmate (Stallfish refuses to win by ending it),
 *   - delivering stalemate, an insufficient-material draw, the fifty-move
 *     draw, or a threefold repetition,
 *   - any move after which the opponent can checkmate on the next move.
 *
 *  Soft penalties — among the surviving moves the quietest, most reversible
 *  shuffle wins: no checks (forcing moves shrink the game), no captures
 *  (material disappears and endgames arrive sooner), pawn pushes only once
 *  the halfmove clock gets close to the fifty-move draw they would prevent,
 *  no hanging material, plenty of legal replies left for the opponent, no
 *  repeated positions, and no move that throws away the evaluation so badly
 *  that the game ends in a forced mate a few moves later anyway.
 *
 * Everything here is pure and stateless given the FEN, the candidate list
 * and the SAN history: the same inputs always produce the same pick, which
 * keeps undo/redo and restored games consistent. The history is replayed
 * from the standard start position, so repetition detection only applies to
 * games that started there; when the replay does not land on the given
 * position the repetition checks are skipped rather than guessed at.
 *
 * The history is replayed once per pick (not once per candidate) and the
 * opponent's replies are scanned in a single pass per candidate, so judging
 * a full move list stays well under a hundred milliseconds.
 */

import { Chess } from 'chess.js';
import { applyUciMove } from './brilliantMove.js';

/** Centipawn material values, for pricing what a move hangs or takes. */
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** The board, side to move, castling and en-passant fields of a FEN. */
export function positionKey(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

function halfmoveClock(fen) {
  // FEN fields: board, turn, castling, en passant, halfmove clock, fullmove.
  const value = Number.parseInt(String(fen || '').trim().split(/\s+/)[4], 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Replay a SAN history from the start position. Returns the position keys
 * seen so far (including the start), or null when the history does not
 * replay cleanly onto the target position.
 */
function replayHistory(history, targetFen) {
  if (!Array.isArray(history) || history.length === 0) return null;
  if (history.some((entry) => typeof entry !== 'string' || !entry)) return null;
  const chess = new Chess();
  const keys = [positionKey(chess.fen())];
  for (const san of history) {
    try {
      const applied = chess.move(san);
      if (!applied) return null;
    } catch {
      return null;
    }
    keys.push(positionKey(chess.fen()));
  }
  return positionKey(chess.fen()) === positionKey(targetFen) ? { keys } : null;
}

export function replayPositionKeys(history, targetFen) {
  const replay = replayHistory(history, targetFen);
  return replay ? replay.keys : null;
}

/**
 * One pass over the opponent's replies: whether any of them is immediate
 * checkmate, and the most material the opponent can win on the spot, net of
 * an immediate recapture on the same square. Only checking replies can be
 * mate and only captures win material, so only those are actually played —
 * most replies are skipped without touching the board.
 */
function scanOpponentReplies(chess, replies) {
  let bestNetCapture = 0;
  for (const reply of replies) {
    const givesCheck = /[+#]/.test(reply.san || '');
    if (!givesCheck && !reply.captured) continue;
    const capturedValue = reply.captured ? PIECE_VALUES[reply.captured] || 0 : 0;
    const applied = chess.move(reply);
    if (!applied) continue;
    if (givesCheck && chess.moves().length === 0) {
      chess.undo();
      return { matesInOne: true, bestNetCapture };
    }
    if (capturedValue > 0) {
      let recapture = 0;
      for (const mine of chess.moves({ verbose: true })) {
        if (mine.to === reply.to && mine.captured) {
          recapture = Math.max(recapture, PIECE_VALUES[mine.captured] || 0);
        }
      }
      bestNetCapture = Math.max(bestNetCapture, capturedValue - recapture);
    }
    chess.undo();
  }
  return { matesInOne: false, bestNetCapture };
}

/**
 * Judge a single candidate move for how well it stalls the game.
 *
 * @param {string} fen - Position before the move.
 * @param {string} uci - Candidate move in UCI form.
 * @param {object} [options]
 * @param {number} [options.score] - Engine score for the move (side to move's view).
 * @param {number} [options.bestScore] - Engine score of the position's best move.
 * @param {string[]} [options.history] - SAN moves played so far.
 * @param {{ keys: string[] }|null} [options.replay] - Precomputed replayHistory
 *   result, so selectStallMove replays the history once for all candidates.
 * @returns {{ stall: boolean, move: string, san?: string, reason: string, stallScore: number }}
 */
export function evaluateStallMove(fen, uci, options = {}) {
  const { score = null, bestScore = null, history = [] } = options;
  const replay = 'replay' in options ? options.replay : replayHistory(history, fen);

  const rejected = (reason) => ({ stall: false, move: uci, stallScore: -Infinity, reason });

  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return rejected('invalid-fen');
  }
  const halfmoveBefore = halfmoveClock(fen);
  const castlingBefore = String(fen || '').trim().split(/\s+/)[2] || '-';

  const applied = applyUciMove(chess, uci);
  if (!applied) return rejected('illegal-move');

  // The game ends on this move: Stallfish refuses every ending, including
  // the winning ones. One move generation answers mate and stalemate both.
  if (chess.isInsufficientMaterial()) return rejected('insufficient-material');
  if (halfmoveClock(chess.fen()) >= 100) return rejected('fifty-move-draw');
  const replies = chess.moves({ verbose: true });
  if (replies.length === 0) return rejected(chess.isCheck() ? 'checkmate' : 'stalemate');
  const resultKey = positionKey(chess.fen());
  const occurrences = replay
    ? replay.keys.reduce((count, key) => count + (key === resultKey ? 1 : 0), 0)
    : 0;
  if (occurrences >= 2) return rejected('threefold-repetition');

  // Survival: never hand the opponent a mate on the spot.
  const { matesInOne, bestNetCapture } = scanOpponentReplies(chess, replies);
  if (matesInOne) return rejected('mate-in-1-against');

  let stallScore = 100;

  // Checks are forcing: they shrink the opponent's options and drag the
  // game toward a forced ending. Aggression is zero.
  const givesCheck = chess.isCheck();
  if (givesCheck) stallScore -= 45;

  // Captures delete material, and deleted material is how games reach
  // mateable endgames. A capture is only worth it when it is the only way
  // to reset the fifty-move clock.
  const capturedValue = applied.captured ? PIECE_VALUES[applied.captured] || 0 : 0;
  if (applied.captured) {
    stallScore -= halfmoveBefore >= 80 ? 10 : 55 + Math.round(capturedValue / 20);
  }

  // Pawn pushes are irreversible, but they reset the halfmove clock.
  // Early they just burn structure; late they are what stands between
  // Stallfish and a fifty-move draw.
  const isPawnMove = applied.piece === 'p';
  if (isPawnMove) {
    if (halfmoveBefore >= 80) stallScore += 70;
    else if (halfmoveBefore >= 60) stallScore += 35;
    else if (halfmoveBefore >= 40) stallScore += 10;
    else stallScore -= 8;
  }

  // Do not hang material: a free piece every move is a short game.
  if (bestNetCapture > 0) stallScore -= Math.min(60, Math.round(bestNetCapture / 5));

  // Keep the opponent swimming in legal replies. Few replies is how
  // stalemates and mates happen.
  const opponentMoves = replies.length;
  if (opponentMoves <= 2) stallScore -= 60;
  else if (opponentMoves <= 4) stallScore -= 30;
  else if (opponentMoves <= 7) stallScore -= 10;
  else stallScore += Math.min(10, Math.floor(opponentMoves / 3));

  // Reversible shuffles (knight, bishop, king) keep every option open.
  if (!applied.captured && !isPawnMove && !givesCheck && ['n', 'b', 'k'].includes(applied.piece)) {
    stallScore += 15;
  }

  // A position that already occurred once is one shuffle away from the
  // threefold repetition that ends the game.
  if (occurrences === 1) stallScore -= 70;

  // Losing castling rights closes off future options for no gain.
  const castlingAfter = chess.fen().trim().split(/\s+/)[2] || '-';
  if (castlingAfter !== castlingBefore) stallScore -= 5;

  // The fewer pieces remain, the closer every ending gets.
  const pieceCount = chess.board().flat().filter(Boolean).length;
  if (pieceCount <= 6) stallScore -= 25;
  if (pieceCount <= 4) stallScore -= 40;

  // Stall hard, but do not blunder the position away: a lost game still
  // ends, just by mate instead of by agreement.
  if (Number.isFinite(score) && Number.isFinite(bestScore)) {
    const diff = score - bestScore;
    if (diff < -120) stallScore -= Math.min(50, Math.round((-diff - 120) / 4));
  }

  return { stall: true, move: uci, san: applied.san, reason: 'stall', stallScore };
}

/**
 * Pick the move for a stalling bot from the scored candidates. Returns
 * `null` when there is nothing to choose from, otherwise
 * `{ move, stall, reason, stallScore, score, refusedEnding }`:
 *
 *  - the highest-scoring stall-safe move wins,
 *  - `refusedEnding` names the ending the engine's best move would have
 *    caused, when Stallfish declined it in favour of a quieter move,
 *  - when every candidate ends the game anyway, the engine's best move is
 *    played as a last resort.
 */
export function selectStallMove(fen, candidates, options = {}) {
  const { history = [] } = options;
  const replay = replayHistory(history, fen);

  const seen = new Set();
  const ranked = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate.move !== 'string' || seen.has(candidate.move)) continue;
    seen.add(candidate.move);
    ranked.push({
      move: candidate.move,
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
      depth: Number(candidate.depth) || 0,
    });
  }
  if (ranked.length === 0) return null;

  const scored = ranked
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score || b.depth - a.depth);
  const best = scored[0] || null;

  const verdicts = new Map();
  const accepted = [];
  for (const candidate of ranked) {
    const verdict = evaluateStallMove(fen, candidate.move, {
      score: candidate.score,
      bestScore: best?.score ?? null,
      replay,
    });
    verdicts.set(candidate.move, verdict);
    if (verdict.stall) accepted.push({ ...candidate, stallScore: verdict.stallScore });
  }

  if (accepted.length === 0) {
    const fallback = best || ranked[0];
    return {
      move: fallback.move,
      stall: false,
      reason: 'no-stall-move-available',
      stallScore: null,
      score: fallback.score,
      refusedEnding: null,
    };
  }

  accepted.sort(
    (a, b) =>
      b.stallScore - a.stallScore ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      (a.move < b.move ? -1 : a.move > b.move ? 1 : 0),
  );
  const chosen = accepted[0];

  const bestVerdict = best ? verdicts.get(best.move) : null;
  const refusedEnding =
    best && bestVerdict && !bestVerdict.stall && chosen.move !== best.move
      ? bestVerdict.reason
      : null;

  return {
    move: chosen.move,
    stall: true,
    reason: 'stall',
    stallScore: chosen.stallScore,
    score: chosen.score,
    refusedEnding,
    alternatives: accepted.slice(1).map(({ move, score, stallScore }) => ({ move, score, stallScore })),
  };
}

export default { selectStallMove, evaluateStallMove, positionKey, replayPositionKeys };
