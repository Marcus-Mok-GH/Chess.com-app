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

// In react-chessboard v5, custom piece renderers receive { fill, square, svgStyle }
const customPieces = Object.entries(PIECE_IMAGES).reduce((acc, [piece, src]) => {
  acc[piece] = ({ svgStyle }) => (
    <img
      src={src}
      alt={piece}
      style={{ 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none',
        ...svgStyle 
      }}
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

  const chessboardOptions = {
    id: "MainChessboard",
    position: currentFen,
    boardOrientation: boardOrientation,
    allowDragging: Boolean(onPieceDrop),
    showNotation: showCoordinates,
    animationDurationInMs: 300,
    darkSquareStyle: { backgroundColor: colors.dark },
    lightSquareStyle: { backgroundColor: colors.light },
    pieces: customPieces,
    squareStyles: customSquareStyles,
    // v5 uses object arguments for callbacks
    onSquareClick: (args) => {
      const square = typeof args === 'string' ? args : args?.square;
      if (square) onSquareClick?.(square);
    },
    onPieceDrop: (args) => {
      const { sourceSquare, targetSquare } = args;
      if (!targetSquare) return false;
      return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
    },
    canDragPiece: (args) => {
      const { piece, square } = args;
      const pieceType = typeof piece === 'object' ? piece.pieceType : piece;
      return canDragPiece?.(pieceType, square) ?? true;
    },
  };

  return (
    <div className={`chess-board-wrapper theme-${boardTheme}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Chessboard options={chessboardOptions} />
    </div>
  );
}