import { PIECE_IMAGE_PATHS } from './pieceImages';

export default function ChessPieceIcon({ piece, color, size = 24, className = '' }) {
  const normalizedColor = color === 'w' || color === 'white' ? 'w' : 'b';
  const key = `${normalizedColor}${piece.toUpperCase()}`;
  const src = PIECE_IMAGE_PATHS[key];

  if (!src) return null;

  return (
    <img draggable={false}
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
    <img draggable={false}
      className={`chess-logo-icon ${className}`}
      src={PIECE_IMAGE_PATHS.bN}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}
