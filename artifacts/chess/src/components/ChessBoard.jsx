import { Chessboard } from 'react-chessboard';

const PIECE_IMAGES = {
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

const customPieces = Object.entries(PIECE_IMAGES).reduce((acc, [piece, src]) => {
  acc[piece] = () => (
    <img
      src={src}
      alt={piece}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      draggable={false}
    />
  );
  return acc;
}, {});

const themeColors = {
  green: { light: '#eeeed2', dark: '#769656' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  purple: { light: '#e8e0f0', dark: '#9070a0' },
};

export default function ChessBoard({
  position,
  onSquareClick,
  onPieceDrop,
  canDragPiece,
  boardOrientation = 'white',
  customSquareStyles = {},
  showCoordinates = true,
  boardTheme = 'green',
}) {
  const colors = themeColors[boardTheme] || themeColors.green;

  // react-chessboard expects a FEN string or position object
  // The position prop passed from parent is a chess.js object
  const currentFen = typeof position.fen === 'function' ? position.fen() : position;

  const chessboardOptions = {
    id: 'MainChessboard',
    position: currentFen,
    onSquareClick: ({ square }) => onSquareClick?.(square),
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
    },
    allowDragging: Boolean(onPieceDrop),
    canDragPiece: ({ piece, square }) => canDragPiece?.(piece?.pieceType, square) ?? true,
    boardOrientation,
    darkSquareStyle: { backgroundColor: colors.dark },
    lightSquareStyle: { backgroundColor: colors.light },
    pieces: customPieces,
    squareStyles: customSquareStyles,
    showNotation: showCoordinates,
    animationDurationInMs: 300,
  };

  return (
    <div className={`chess-board-wrapper theme-${boardTheme}`} style={{ width: '100%', height: '100%' }}>
      <Chessboard options={chessboardOptions} />
    </div>
  );
}
