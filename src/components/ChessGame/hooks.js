import { useState, useCallback, useRef, useMemo } from 'react';

export function useCapturedPieces(game) {
  return useMemo(() => {
    if (!game) {
      return { w: [], b: [] };
    }

    const initial = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          current[piece.color][piece.type]++;
        }
      }
    }

    const captured = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      for (const piece of ['q', 'r', 'b', 'n', 'p']) {
        const diff = initial[color][piece] - current[color][piece];
        for (let i = 0; i < diff; i++) {
          captured[color].push(piece);
        }
      }
    }
    return captured;
  }, [game]);
}

export function usePieceAnimations() {
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const animationIdRef = useRef(0);

  const triggerAnimation = useCallback((moveData) => {
    const animations = [];

    if (moveData.flags && moveData.flags.includes('k')) {
      const kingFrom = moveData.from;
      const kingTo = moveData.to;
      const rookFrom = moveData.color === 'w' ? 'h1' : 'h8';
      const rookTo = moveData.color === 'w' ? 'f1' : 'f8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: kingFrom,
        toSquare: kingTo,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else if (moveData.flags && moveData.flags.includes('q')) {
      const kingFrom = moveData.from;
      const kingTo = moveData.to;
      const rookFrom = moveData.color === 'w' ? 'a1' : 'a8';
      const rookTo = moveData.color === 'w' ? 'd1' : 'd8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: kingFrom,
        toSquare: kingTo,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else {
      animations.push({
        id: animationIdRef.current++,
        piece: { type: moveData.piece, color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      if (moveData.captured) {
        animations.push({
          id: animationIdRef.current++,
          piece: { type: moveData.captured, color: moveData.color === 'w' ? 'b' : 'w' },
          fromSquare: moveData.to,
          toSquare: moveData.to,
          captured: true,
        });
      }
    }

    setAnimatingPieces(prev => [...prev, ...animations]);
  }, []);

  const removeAnimation = useCallback((animationId) => {
    setAnimatingPieces(prev => prev.filter(anim => anim.id !== animationId));
  }, []);

  return { animatingPieces, triggerAnimation, removeAnimation };
}
