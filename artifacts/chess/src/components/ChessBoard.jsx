import { Chessboard } from 'react-chessboard';
import { useMemo } from 'react';

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

  // Robust FEN extraction
  const currentFen = useMemo(() => {
    if (!position) return 'start';
    if (typeof position === 'string') return position;
    if (typeof position.fen === 'function') return position.fen();
    if (position.fen && typeof position.fen === 'string') return position.fen;
    return 'start';
  }, [position]);

  // Custom piece renderer
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

  // v5 Options API configuration
  // We keep position separate for reactivity as recommended in some v5 patterns
  const options = useMemo(() => ({
    // Interactions
    allowDragging: true,
    onSquareClick: (square) => {
      // Signature: (square: string) => void
      onSquareClick?.(square);
    },
    onPieceDrop: (sourceSquare, targetSquare, piece) => {
      // Signature: (source: string, target: string, piece: string) => boolean
      return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
    },
    canDragPiece: ({ piece, sourceSquare }) => {
      // Signature: ({ piece, sourceSquare }) => boolean
      // Note: mapping sourceSquare to what parent expects
      return canDragPiece?.(piece, sourceSquare) ?? true;
    },
    
    // Appearance
    boardOrientation,
    showBoardNotation: showCoordinates,
    animationDuration: 300,
    customPieces,
    customSquareStyles,
    customDarkSquareStyle: { backgroundColor: colors.dark },
    customLightSquareStyle: { backgroundColor: colors.light },
  }), [
    onSquareClick, 
    onPieceDrop, 
    canDragPiece, 
    boardOrientation, 
    showCoordinates, 
    customPieces, 
    customSquareStyles, 
    colors
  ]);

  return (
    <div 
      className={`chess-board-wrapper theme-${boardTheme}`}
      style={{ 
        width: '100%',
        height: '100%',
        touchAction: 'none',
        position: 'absolute',
        top: 0,
        left: 0
      }}
    >
      <Chessboard 
        id="MainBoard"
        position={currentFen}
        options={options}
      />
    </div>
  );
}
