import { Chess } from 'chess.js';

/**
 * Build a short human-readable label for a move (SAN when it is legal).
 *
 * @param {import('chess.js').Chess} game - Current position.
 * @param {string} from - Source square.
 * @param {string} to - Target square.
 * @param {string} [promotion] - Promotion piece for pawn moves.
 * @returns {string|null} SAN (e.g. "Nf3") or a compact "from-to" fallback.
 */
export function describeMove(game, from, to, promotion) {
  if (!game || !from || !to) return null;
  try {
    const copy = new Chess(game.fen());
    const move = copy.move({ from, to, promotion: promotion || 'q' });
    return move?.san || `${from}-${to}`;
  } catch {
    return `${from}-${to}`;
  }
}

/**
 * When the "Confirm Moves" setting is enabled, ask the player to confirm a
 * move before it is played. Synchronous by design so drag-and-drop handlers
 * (which must return a boolean immediately) can use it.
 *
 * @param {Object} params
 * @param {Object} [params.settings] - Settings object; only `confirmMoves` is read.
 * @param {import('chess.js').Chess} [params.game] - Current position, used to label the move.
 * @param {string} params.from - Source square.
 * @param {string} params.to - Target square.
 * @param {string} [params.promotion] - Promotion piece for pawn moves.
 * @returns {boolean} True when the move may proceed.
 */
export function confirmMove({ settings, game, from, to, promotion } = {}) {
  if (!settings?.confirmMoves) return true;

  const label = describeMove(game, from, to, promotion);
  const message = label ? `Confirm move: ${label}?` : 'Confirm this move?';
  return window.confirm(message);
}

export default confirmMove;
