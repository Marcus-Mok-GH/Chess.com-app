import { Chess } from 'chess.js';

const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

export function findKingSquare(game, color) {
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'k' && piece.color === color) {
        return String.fromCharCode(97 + col) + (8 - row);
      }
    }
  }
  return null;
}

export function parseEngineMove(move) {
  if (!move || typeof move !== 'string') return move;
  const trimmed = move.trim();
  if (UCI_MOVE_REGEX.test(trimmed)) {
    return {
      from: trimmed.slice(0, 2),
      to: trimmed.slice(2, 4),
      promotion: trimmed.length > 4 ? trimmed[4].toLowerCase() : undefined,
    };
  }
  return trimmed;
}

export function applyEngineMove(gameInstance, move) {
  if (!gameInstance || !move) return null;
  const parsed = parseEngineMove(move);
  if (typeof parsed === 'string') {
    return gameInstance.move(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    const moveObj = {
      from: parsed.from,
      to: parsed.to,
      ...(parsed.promotion ? { promotion: parsed.promotion } : {}),
    };
    return gameInstance.move(moveObj);
  }
  return null;
}

export function getMoveCoords(gameInstance, move) {
  const parsed = parseEngineMove(move);
  if (parsed && typeof parsed === 'object') {
    return { from: parsed.from, to: parsed.to };
  }
  if (typeof parsed === 'string') {
    const tempGame = new Chess(gameInstance.fen());
    const applied = tempGame.move(parsed);
    if (applied) {
      return { from: applied.from, to: applied.to };
    }
  }
  return null;
}
