import { Chess } from 'chess.js';

// A premove is a move the player queues while it is the opponent's turn. It is
// never applied speculatively: the position is validated only once the turn
// returns, so an opponent reply that makes the queued move illegal simply
// discards it. Shared by local/bot games (ChessGame) and online games
// (OnlineChessGame).

export const DEFAULT_PREMOVE_PROMOTION = 'q';

const VALID_PROMOTIONS = ['q', 'r', 'b', 'n'];

/**
 * Normalizes a queued premove, returning null when the squares are missing or
 * malformed so a bad drag can never enqueue a premove.
 */
export function createPremove(from, to, promotion) {
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (from.length < 2 || to.length < 2) return null;
  if (from === to) return null;
  const promo = typeof promotion === 'string'
    ? promotion.toLowerCase()
    : DEFAULT_PREMOVE_PROMOTION;
  return {
    from,
    to,
    promotion: VALID_PROMOTIONS.includes(promo) ? promo : DEFAULT_PREMOVE_PROMOTION,
  };
}

/**
 * Candidate target squares for one of the player's pieces while the opponent is
 * on the move. chess.js only generates moves for the side to move, so the
 * position is evaluated as if it were the player's turn; the result is a
 * best-effort preview, and the real legality check happens on application.
 */
export function premoveTargets(fen, colorCode, square) {
  if (!fen || !square || (colorCode !== 'w' && colorCode !== 'b')) return [];
  try {
    const position = new Chess(fen);
    const piece = position.get(square);
    if (!piece || piece.color !== colorCode) return [];
    const fields = fen.split(' ');
    fields[1] = colorCode;
    const asPlayerTurn = new Chess(fields.join(' '));
    return asPlayerTurn.moves({ square, verbose: true }).map((move) => move.to);
  } catch {
    return [];
  }
}

/**
 * Whether the queued premove is a fully legal move in the position the opponent
 * left. Illegal premoves are discarded rather than played.
 */
export function isPremoveLegal(fen, premove) {
  if (!fen || !premove) return false;
  try {
    const position = new Chess(fen);
    const applied = position.move({
      from: premove.from,
      to: premove.to,
      promotion: premove.promotion || DEFAULT_PREMOVE_PROMOTION,
    });
    return Boolean(applied);
  } catch {
    return false;
  }
}