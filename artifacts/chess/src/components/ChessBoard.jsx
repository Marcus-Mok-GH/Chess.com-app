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
  acc[piece] = ({ squareWidth }) => (
    <div style={{ width: squareWidth, height: squareWidth }}>
      <img
        src={src}
        alt={piece}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        draggable={false}
      />
    </div>
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

  // react-chessboard expects a FEN string or position object
  const currentFen = typeof position?.fen === 'function' ? position.fen() : position;

  // Handler for square clicks in react-chessboard v4+
  const handleSquareClick = (square) => {
    if (square) onSquareClick?.(square);
  };

  // Handler for piece drops in react-chessboard v4+
  const handlePieceDrop = (sourceSquare, targetSquare, piece) => {
    if (!targetSquare) return false;
    return onPieceDrop?.(sourceSquare, targetSquare) ?? false;
  };

  // Handler for drag start in react-chessboard v4+
  const handlePieceDragBegin = (piece, square) => {
    // piece is a string like 'wP'
    return canDragPiece?.(piece, square) ?? true;
  };

  return (
    <div className={`chess-board-wrapper theme-${boardTheme}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Chessboard 
        id="MainChessboard"
        position={currentFen}
        boardOrientation={boardOrientation}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        onPieceDragBegin={handlePieceDragBegin}
        showBoardNotation={showCoordinates}
        animationDuration={300}
        customDarkSquareStyle={{ backgroundColor: colors.dark }}
        customLightSquareStyle={{ backgroundColor: colors.light }}
        customPieces={customPieces}
        customSquareStyles={customSquareStyles}
        boardWidth={undefined} // Let it fill the container
      />
    </div>
  );
}