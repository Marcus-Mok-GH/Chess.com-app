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
    return 'start';
  }, [position]);

  const customPieces = useMemo(() => {
    return Object.entries(PIECE_IMAGES).reduce((acc, [piece, src]) => {
      acc[piece] = ({ svgStyle }) => (
        <img
          src={src}
          alt={piece}
          style={{ ...svgStyle, display: 'block', pointerEvents: 'none' }}
          draggable={false}
        />
      );
      return acc;
    }, {});
  }, []);

  const chessboardOptions = useMemo(() => ({
    position: currentFen,
    boardOrientation,
    showNotation: showCoordinates,
    animationDurationInMs: 300,
    pieces: customPieces,
    squareStyles: customSquareStyles,
    darkSquareStyle: { backgroundColor: colors.dark },
    lightSquareStyle: { backgroundColor: colors.light },
    allowDragging: true,
    onSquareClick: (args) => {
      // args: { square: string, piece: PieceDataType | null }
      onSquareClick?.(args.square);
    },
    onPieceDrop: (args) => {
      // args: { sourceSquare: string, targetSquare: string | null, piece: DraggingPieceDataType }
      if (!args.targetSquare) return false;
      return onPieceDrop?.(args.sourceSquare, args.targetSquare) ?? false;
    },
    canDragPiece: (args) => {
      // args: { piece: PieceDataType, square: string | null, isSparePiece: boolean }
      // The parent expects (pieceType, square)
      return canDragPiece?.(args.piece.pieceType, args.square) ?? true;
    }
  }), [
    currentFen,
    boardOrientation,
    showCoordinates,
    customPieces,
    customSquareStyles,
    colors,
    onSquareClick,
    onPieceDrop,
    canDragPiece
  ]);

  return (
    <div 
      className={`chess-board-wrapper theme-${boardTheme}`}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'absolute', 
        top: 0, 
        left: 0,
        boxShadow: '0 0 40px rgba(0,0,0,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
        touchAction: 'none'
      }}
    >
      <Chessboard options={chessboardOptions} />
    </div>
  );
}
