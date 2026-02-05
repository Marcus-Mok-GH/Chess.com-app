import { useState, useEffect, useRef } from 'react';
import { ChessPiece } from './ChessPieces';

function getSquareColor(row, col) {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}

function getSquareName(row, col) {
  return String.fromCharCode(97 + col) + (8 - row);
}

function squareToCoords(square) {
  const col = square.charCodeAt(0) - 97;
  const row = 8 - parseInt(square[1]);
  return { row, col };
}

export default function ChessBoard({
  position,
  onPieceDrop,
  onSquareClick,
  boardOrientation = 'white',
  customSquareStyles = {},
  showCoordinates = true,
  boardTheme = 'green',
  isInteractive = true,
}) {
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [animatingPiece, setAnimatingPiece] = useState(null);
  const prevPositionRef = useRef(null);

  // Validate position prop
  if (!position || typeof position.board !== 'function' || typeof position.fen !== 'function') {
    console.error('[ChessBoard] Invalid position prop:', position);
    return (
      <div className={`chess-board theme-${boardTheme}`} style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#262421',
        color: '#ff6b6b',
        fontSize: '14px',
        padding: '20px',
        textAlign: 'center'
      }}>
        ⚠️ Error: Invalid chess position data
      </div>
    );
  }

  let board;
  let currentFen;
  
  try {
    board = position.board();
    currentFen = position.fen();
  } catch (error) {
    console.error('[ChessBoard] Error getting board/fen:', error);
    return (
      <div className={`chess-board theme-${boardTheme}`} style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#262421',
        color: '#ff6b6b',
        fontSize: '14px',
        padding: '20px',
        textAlign: 'center'
      }}>
        ⚠️ Error loading chess position
      </div>
    );
  }
  const isFlipped = boardOrientation === 'black';

  useEffect(() => {
    const history = position.history({ verbose: true });
    const lastMove = history[history.length - 1];

    if (lastMove && prevPositionRef.current !== currentFen) {
      setAnimatingPiece({
        square: lastMove.to,
        startX: 0,
        startY: 0,
      });

      const timer = setTimeout(() => setAnimatingPiece(null), 200);
      prevPositionRef.current = currentFen;
      return () => clearTimeout(timer);
    }

    prevPositionRef.current = currentFen;
  }, [currentFen, position]);

  useEffect(() => {
    if (!isInteractive && draggedFrom) {
      setDraggedFrom(null);
    }
  }, [isInteractive, draggedFrom]);

  const handleDragStart = (e, row, col, piece) => {
    if (!isInteractive) return;
    if (!piece) return;
    const square = getSquareName(row, col);
    setDraggedFrom(square);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', square);
  };

  const handleDragOver = (e) => {
    if (!isInteractive) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, row, col) => {
    if (!isInteractive) return;
    e.preventDefault();
    const targetSquare = getSquareName(row, col);
    if (draggedFrom && draggedFrom !== targetSquare) {
      onPieceDrop(draggedFrom, targetSquare);
    }
    setDraggedFrom(null);
  };

  const handleDragEnd = () => {
    if (!isInteractive) return;
    setDraggedFrom(null);
  };

  const handleClick = (row, col) => {
    if (!isInteractive) return;
    const square = getSquareName(row, col);
    onSquareClick(square);
  };

  const renderSquare = (row, col) => {
    const actualRow = isFlipped ? 7 - row : row;
    const actualCol = isFlipped ? 7 - col : col;
    const piece = board[actualRow][actualCol];
    const squareName = getSquareName(actualRow, actualCol);
    const squareColor = getSquareColor(actualRow, actualCol);
    const customStyle = customSquareStyles[squareName] || {};
    
    const isAnimating = animatingPiece && animatingPiece.square === squareName;
    const animationStyle = isAnimating ? {
      transition: 'transform 0.2s ease',
    } : {};

    return (
      <div
        key={`${row}-${col}`}
        className={`chess-square ${squareColor}`}
        style={customStyle}
        onClick={() => handleClick(actualRow, actualCol)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, actualRow, actualCol)}
      >
        {piece && (
          <div
            className={`chess-piece-wrapper ${isAnimating ? 'animating' : ''}`}
            draggable={isInteractive}
            onDragStart={(e) => handleDragStart(e, actualRow, actualCol, piece)}
            onDragEnd={handleDragEnd}
            style={animationStyle}
          >
            <ChessPiece piece={piece} />
          </div>
        )}
        {showCoordinates && col === 0 && (
          <span className="rank-label">{isFlipped ? row + 1 : 8 - row}</span>
        )}
        {showCoordinates && row === 7 && (
          <span className="file-label">
            {String.fromCharCode(97 + (isFlipped ? 7 - col : col))}
          </span>
        )}
      </div>
    );
  };

  const rows = [];
  for (let row = 0; row < 8; row++) {
    const squares = [];
    for (let col = 0; col < 8; col++) {
      squares.push(renderSquare(row, col));
    }
    rows.push(
      <div key={row} className="chess-row">
        {squares}
      </div>
    );
  }

  return (
    <div className={`chess-board theme-${boardTheme}`}>
      {rows}
    </div>
  );
}
