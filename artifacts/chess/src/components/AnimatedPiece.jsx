import { useEffect, useState } from 'react';
import { ChessPiece } from './ChessPieces';

export default function AnimatedPiece({
  piece,
  fromSquare,
  toSquare,
  boardOrientation,
  onComplete,
  captured = false,
}) {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
      onComplete?.();
    }, 200);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const getSquarePosition = (square) => {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = 8 - parseInt(square[1]); // 8=0, 7=1, etc.

    if (boardOrientation === 'black') {
      return {
        x: (7 - file) * 12.5,
        y: (7 - rank) * 12.5,
      };
    }

    return {
      x: file * 12.5,
      y: rank * 12.5,
    };
  };

  const fromPos = getSquarePosition(fromSquare);
  const toPos = toSquare ? getSquarePosition(toSquare) : fromPos;
  const currentPos = isAnimating ? fromPos : toPos;

  return (
    <div
      className="animated-piece"
      style={{
        position: 'absolute',
        width: '12.5%',
        height: '12.5%',
        left: '0%',
        top: '0%',
        transform: `translate(${currentPos.x}%, ${currentPos.y}%)`,
        transition: 'transform 0.2s ease',
        zIndex: 100,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '7.5%',
      }}
    >
      <ChessPiece piece={piece} />
    </div>
  );
}
