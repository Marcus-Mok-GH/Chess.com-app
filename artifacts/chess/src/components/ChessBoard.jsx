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

  // v5 event handlers
  const handleSquareClick = (square) => {
    // v5 onSquareClick passes the square string directly
    if (typeof square === 'string') {
      onSquareClick?.(square);
    }
  };

  const handlePieceDrop = (sourceSquare, targetSquare, piece) => {
    // v5 onPieceDrop(sourceSquare, targetSquare, piece)
    return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
  };

  const handleCanDragPiece = ({ piece, square }) => {
    // v5 isDraggablePiece({ piece, square })
    const pieceType = typeof piece === 'string' ? piece : piece?.pieceType;
    return canDragPiece?.(pieceType, square) ?? true;
  };

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
        boardOrientation={boardOrientation}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        isDraggablePiece={handleCanDragPiece}
        arePiecesDraggable={true}
        showBoardNotation={showCoordinates}
        animationDuration={300}
        customDarkSquareStyle={{ backgroundColor: colors.dark }}
        customLightSquareStyle={{ backgroundColor: colors.light }}
        customPieces={customPieces}
        customSquareStyles={customSquareStyles}
      />
    </div>
  );
}
