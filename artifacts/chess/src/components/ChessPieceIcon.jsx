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

export default function ChessPieceIcon({ piece, color, size = 24, className = '' }) {
  const normalizedColor = color === 'w' || color === 'white' ? 'w' : 'b';
  const key = `${normalizedColor}${piece.toUpperCase()}`;
  const src = PIECE_IMAGE_PATHS[key];

  if (!src) return null;

  return (
    <img
      className={`chess-piece-icon ${className}`}
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

export function LogoIcon({ size = 28, className = '' }) {
  return (
    <img
      className={`chess-logo-icon ${className}`}
      src={PIECE_IMAGE_PATHS.bN}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}
