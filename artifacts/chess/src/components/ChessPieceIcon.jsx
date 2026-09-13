import { PIECE_IMAGE_PATHS } from './pieceImages';

const imageStyle = { display: 'inline-block', verticalAlign: 'middle' };

function IconImage({ className, size, src }) {
  return (
    <img
      draggable={false}
      className={className}
      src={src}
      alt=""
      width={size}
      height={size}
      style={imageStyle}
    />
  );
}

export default function ChessPieceIcon({ piece, color, size = 24, className = '' }) {
  const normalizedColor = color === 'w' || color === 'white' ? 'w' : 'b';
  const key = `${normalizedColor}${piece.toUpperCase()}`;
  const src = PIECE_IMAGE_PATHS[key];

  if (!src) return null;

  return <IconImage className={`chess-piece-icon ${className}`} size={size} src={src} />;
}

export function LogoIcon({ size = 28, className = '' }) {
  return <IconImage className={`chess-logo-icon ${className}`} size={size} src={PIECE_IMAGE_PATHS.bN} />;
}
