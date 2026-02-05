import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPieces';

const EMPTY_BOARD = Array.from({ length: 8 }, () => Array(8).fill(null));

function getSquareColor(row, col) {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}

function getSquareName(row, col) {
  return String.fromCharCode(97 + col) + (8 - row);
}

function resolveBoard(position) {
  if (!position) {
    return { board: EMPTY_BOARD, valid: false };
  }

  if (typeof position.board === 'function' && typeof position.fen === 'function') {
    try {
      const board = position.board();
      if (Array.isArray(board) && board.length === 8) {
        return { board, valid: true };
      }
    } catch (error) {
      console.error('[ChessBoard] Failed to read board from position:', error);
    }
    return { board: EMPTY_BOARD, valid: false };
  }

  if (typeof position === 'string') {
    try {
      const game = new Chess(position);
      const board = game.board();
      if (Array.isArray(board) && board.length === 8) {
        return { board, valid: true };
      }
    } catch (error) {
      console.error('[ChessBoard] Failed to parse FEN:', error);
    }
  }

  console.error('[ChessBoard] Invalid position prop:', position);
  return { board: EMPTY_BOARD, valid: false };
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
  const [dragOrigin, setDragOrigin] = useState(null);

  const { board, valid } = useMemo(() => resolveBoard(position), [position]);
  const isFlipped = boardOrientation === 'black';

  const handleDragStart = (event, square, piece) => {
    if (!isInteractive || !piece) return;
    setDragOrigin(square);
    try {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', square);
    } catch (error) {
      // Ignore drag data errors (Safari, etc.)
    }
  };

  const handleDragEnd = () => {
    if (!isInteractive) return;
    setDragOrigin(null);
  };

  const handleDragOver = (event) => {
    if (!isInteractive) return;
    event.preventDefault();
    try {
      event.dataTransfer.dropEffect = 'move';
    } catch (error) {
      // Ignore
    }
  };

  const handleDrop = (event, square) => {
    if (!isInteractive) return;
    event.preventDefault();
    const fromSquare = dragOrigin || event.dataTransfer?.getData('text/plain');
    if (fromSquare && fromSquare !== square) {
      onPieceDrop?.(fromSquare, square);
    }
    setDragOrigin(null);
  };

  const handleClick = (square) => {
    if (!isInteractive) return;
    onSquareClick?.(square);
  };

  const renderSquare = (row, col) => {
    const actualRow = isFlipped ? 7 - row : row;
    const actualCol = isFlipped ? 7 - col : col;
    const squareName = getSquareName(actualRow, actualCol);
    const squareColor = getSquareColor(actualRow, actualCol);
    const piece = board?.[actualRow]?.[actualCol] || null;
    const customStyle = customSquareStyles[squareName] || {};

    return (
      <div
        key={`${row}-${col}`}
        className={`chess-square ${squareColor}`}
        style={customStyle}
        onClick={() => handleClick(squareName)}
        onDragOver={handleDragOver}
        onDrop={(event) => handleDrop(event, squareName)}
      >
        {piece && (
          <div
            className="chess-piece-wrapper"
            draggable={isInteractive}
            onDragStart={(event) => handleDragStart(event, squareName, piece)}
            onDragEnd={handleDragEnd}
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
  for (let row = 0; row < 8; row += 1) {
    const squares = [];
    for (let col = 0; col < 8; col += 1) {
      squares.push(renderSquare(row, col));
    }
    rows.push(
      <div key={row} className="chess-row">
        {squares}
      </div>
    );
  }

  return (
    <div
      className={`chess-board theme-${boardTheme}`}
      style={valid ? undefined : { position: 'relative' }}
    >
      {rows}
      {!valid && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: '0.9rem',
            textAlign: 'center',
            padding: '12px',
          }}
        >
          Unable to render this position.
        </div>
      )}
    </div>
  );
}
