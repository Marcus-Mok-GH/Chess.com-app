import { Chess } from 'chess.js';
import { normalizeMoveHistory, getMoveFromEntry, getSanFromEntry } from '../game/moveHistory';

/**
 * Replays a stored move history and returns every position of the game.
 *
 * @returns {{ fens: string[], sans: string[], ucis: string[] }}
 *   `fens` has length N + 1 (start position plus one FEN after each played
 *   move); `sans` and `ucis` have length N.
 */
export function buildReviewPositions(moveHistory) {
  const game = new Chess();
  const fens = [game.fen()];
  const sans = [];
  const ucis = [];

  for (const entry of normalizeMoveHistory(moveHistory)) {
    const move = getMoveFromEntry(entry) || getSanFromEntry(entry);
    if (!move) continue;
    let applied;
    try { applied = game.move(move); } catch { break; }
    if (!applied) break;
    sans.push(applied.san);
    ucis.push(applied.from + applied.to + (applied.promotion || ''));
    fens.push(game.fen());
  }

  return { fens, sans, ucis };
}

/** Win probability (0-100, white's perspective) for a centipawn score. */
export function winPercentFromCp(cp) {
  const clamped = Math.max(-10000, Math.min(10000, Number.isFinite(cp) ? cp : 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/**
 * Per-move accuracy (0-100) from the win-percent drop the move caused.
 * Same curve family used by lichess-style reviews.
 */
export function accuracyFromWinDelta(winDelta) {
  const drop = Math.max(0, winDelta);
  if (drop <= 0) return 100;
  const accuracy = 103.1668 * Math.exp(-0.04354 * (drop + 1)) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

/** Win-percent drop caused by a move that lost `cpLoss` centipawns. */
export function winDropFromLoss(cpLoss) {
  return winPercentFromCp(0) - winPercentFromCp(-Math.max(0, cpLoss));
}

/**
 * Centipawn loss of the move played at `plyIndex` (0-based), given the
 * side-to-move-perspective scores of every position (null = not analyzed).
 * A ply's loss is what the mover gave up: their best expectation before the
 * move minus what they can still expect afterwards.
 */
export function centipawnLossAt(evalScores, plyIndex) {
  if (!Array.isArray(evalScores)) return null;
  const before = evalScores[plyIndex];
  const after = evalScores[plyIndex + 1];
  if (before == null || after == null) return null;
  const loss = before + after; // after is opponent-perspective, so negate it
  return Math.max(0, Math.min(10000, loss));
}

export const MOVE_CLASSES = {
  best: { label: 'Best', color: '#26c2a3' },
  excellent: { label: 'Excellent', color: '#7cb926' },
  good: { label: 'Good', color: '#a3b1a3' },
  inaccuracy: { label: 'Inaccuracy', color: '#e6b008' },
  mistake: { label: 'Mistake', color: '#e68f28' },
  blunder: { label: 'Blunder', color: '#d3453c' },
};

/**
 * Classify a move from its centipawn loss. `isBestMove` (played move equals
 * the engine's first choice) upgrades to "best".
 */
export function classifyMove(cpLoss, isBestMove = false) {
  if (isBestMove) return 'best';
  if (cpLoss == null) return null;
  if (cpLoss <= 10) return 'best';
  if (cpLoss <= 25) return 'excellent';
  if (cpLoss <= 50) return 'good';
  if (cpLoss <= 100) return 'inaccuracy';
  if (cpLoss <= 200) return 'mistake';
  return 'blunder';
}

/**
 * Aggregate one side's review: accuracy and classification counts over the
 * given ply indexes (the caller filters whose moves they are).
 */
export function summarizeSide(losses, plyIndexes) {
  const counts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  const accuracies = [];
  for (const i of plyIndexes) {
    const cpLoss = losses[i];
    if (cpLoss == null) continue;
    accuracies.push(accuracyFromWinDelta(winDropFromLoss(cpLoss)));
    const cls = classifyMove(cpLoss, false);
    if (cls) counts[cls] += 1;
  }
  const accuracy = accuracies.length
    ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
    : null;
  return { accuracy, counts, analyzedMoves: accuracies.length };
}

/** Format an engine score (white perspective, centipawns) for display. */
export function formatEval(cpWhite) {
  if (cpWhite == null) return '—';
  if (cpWhite >= 90000) return 'M';
  if (cpWhite <= -90000) return '-M';
  const pawns = cpWhite / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : '';
  return `${sign}${Math.abs(pawns).toFixed(1)}`;
}
