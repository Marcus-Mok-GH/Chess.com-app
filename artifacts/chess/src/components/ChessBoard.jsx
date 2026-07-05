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
  green: { light: '#ebecd0', dark: '#779556' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  purple: { light: '#efdcf5', dark: '#8877b7' },
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

  // react-chessboard v5 expects a FEN string or position object
  const currentFen = typeof position?.fen === 'function' ? position.fen() : position;

  // react-chessboard v5 API uses an 'options' prop for most configurations.
  const chessboardOptions = {
    id: "MainChessboard",
    position: currentFen,
    orientation: boardOrientation,
    allowDragging: Boolean(onPieceDrop),
    showNotation: showCoordinates,
    animationDuration: 300,
    customDarkSquareStyle: { backgroundColor: colors.dark },
    customLightSquareStyle: { backgroundColor: colors.light },
    customPieces: customPieces,
    customSquareStyles: customSquareStyles,
    onSquareClick: (args) => {
      const square = args?.square || args;
      onSquareClick?.(square);
    },
    onPieceDrop: (args) => {
      const { sourceSquare, targetSquare } = args || {};
      if (!targetSquare) return false;
      return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
    },
    isDraggablePiece: (args) => {
      const { piece, sourceSquare } = args || {};
      // Handle piece as object (v5) or string (v4 fallback)
      const pieceType = typeof piece === 'object' ? piece.pieceType : piece;
      return canDragPiece?.(pieceType, sourceSquare) ?? true;
    },
  };

  return (
    <div className={`chess-board-wrapper theme-${boardTheme}`} style={{ width: '100%', height: '100%', minHeight: '300px' }}>
      <Chessboard options={chessboardOptions} />
    </div>
  );
}
