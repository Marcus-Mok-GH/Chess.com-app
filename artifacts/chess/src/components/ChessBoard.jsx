import { Chessboard } from 'react-chessboard';
import { useMemo, useEffect } from 'react';

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

  const currentFen = useMemo(() => {
    if (!position) return 'start';
    if (typeof position === 'string') return position;
    if (typeof position.fen === 'function') return position.fen();
    if (position.fen && typeof position.fen === 'string') return position.fen;
    return 'start';
  }, [position]);

  const customPieces = useMemo(() => {
    return Object.entries(PIECE_IMAGES).reduce((acc, [piece, src]) => {
      acc[piece] = ({ squareWidth }) => (
        <img
          src={src}
          alt={piece}
          style={{ 
            width: squareWidth || '100%', 
            height: squareWidth || '100%', 
            display: 'block',
            pointerEvents: 'none'
          }}
          draggable={false}
        />
      );
      return acc;
    }, {});
  }, []);

  // Standardize the v5 options object
  const chessboardOptions = useMemo(() => ({
    onSquareClick: (args) => {
      const square = typeof args === 'string' ? args : args?.square;
      if (square) onSquareClick?.(square);
    },
    onPieceDrop: (args) => {
      // Standardize the drop arguments for both v4 and v5 patterns
      let from, to;
      if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
        from = args.sourceSquare;
        to = args.targetSquare;
      } else {
        // Fallback for older patterns
        from = arguments[0];
        to = arguments[1];
      }
      return onPieceDrop?.(from, to) ?? false;
    },
    canDragPiece: (args) => {
      if (typeof args === 'object' && args !== null && 'piece' in args) {
        const { piece, square: s } = args;
        const pieceType = typeof piece === 'object' ? piece.pieceType : piece;
        return canDragPiece?.(pieceType, s) ?? true;
      }
      return true;
    },
    boardOrientation,
    showBoardNotation: showCoordinates,
    animationDuration: 300,
    customDarkSquareStyle: { backgroundColor: colors.dark },
    customLightSquareStyle: { backgroundColor: colors.light },
    customPieces: customPieces,
    customSquareStyles: customSquareStyles,
    allowDragging: true,
  }), [onSquareClick, onPieceDrop, canDragPiece, boardOrientation, showCoordinates, colors, customPieces, customSquareStyles]);

  return (
    <div 
      className={`chess-board-wrapper theme-${boardTheme}`}
      style={{ 
        width: '100%',
        height: '100%',
        touchAction: 'none' // Prevents scrolling while dragging on mobile
      }}
    >
      <Chessboard 
        id="MainBoard"
        position={currentFen}
        options={chessboardOptions}
      />
    </div>
  );
}
