// Chess piece rendering uses external SVG assets so all pages share the same custom piece set.

const PIECE_IMAGE_PATHS = {
  wK: '/custom-pieces/wK.svg',
  wQ: '/custom-pieces/wQ.svg',
  wR: '/custom-pieces/wR.svg',
  wB: '/custom-pieces/wB.svg',
  wN: '/custom-pieces/wN.svg',
  wP: '/custom-pieces/wP.svg',
  bK: '/custom-pieces/bK.svg',
  bQ: '/custom-pieces/bQ.svg',
  bR: '/custom-pieces/bR.svg',
  bB: '/custom-pieces/bB.svg',
  bN: '/custom-pieces/bN.svg',
  bP: '/custom-pieces/bP.svg',
};

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
