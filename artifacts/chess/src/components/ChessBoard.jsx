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

  // Robust custom piece renderer
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

  const handleSquareClick = (args) => {
    // In react-chessboard v5, onSquareClick usually receives the square string directly,
    // but we handle both cases defensively.
    const square = typeof args === 'string' ? args : args?.square;
    if (square) onSquareClick?.(square);
  };

  const handlePieceDrop = (args, target, piece) => {
    // Check if args is the v5 object { sourceSquare, targetSquare, piece }
    if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
      const { sourceSquare, targetSquare } = args;
      return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
    }
    // Fallback to positional arguments
    return onPieceDrop?.(args, target) ?? false;
  };

  const handleCanDragPiece = (args, square) => {
    if (typeof args === 'object' && args !== null && 'piece' in args) {
      const { piece, square: s } = args;
      const pieceType = typeof piece === 'object' ? piece.pieceType : piece;
      return canDragPiece?.(pieceType, s) ?? true;
    }
    return canDragPiece?.(args, square) ?? true;
  };

  return (
    <div 
      className={`chess-board-wrapper theme-${boardTheme}`} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <Chessboard 
          id="MainBoard"
          position={currentFen}
          boardOrientation={boardOrientation}
          onPieceDrop={handlePieceDrop}
          onSquareClick={handleSquareClick}
          arePiecesDraggable={Boolean(onPieceDrop)}
          showBoardNotation={showCoordinates}
          animationDuration={300}
          customDarkSquareStyle={{ backgroundColor: colors.dark }}
          customLightSquareStyle={{ backgroundColor: colors.light }}
          customPieces={customPieces}
          customSquareStyles={customSquareStyles}
          isDraggablePiece={handleCanDragPiece}
        />
      </div>
    </div>
  );
}
