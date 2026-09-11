import { PIECE_IMAGE_PATHS } from './pieceImages';

export function ChessPiece({ piece }) {
  if (!piece) return null;

  const key = piece.color + piece.type.toUpperCase();
  const src = PIECE_IMAGE_PATHS[key];
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: '100%', display: 'block' }}
      draggable={false}
    />
  );
}
