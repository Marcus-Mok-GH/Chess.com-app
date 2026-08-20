import { useEffect, useRef, useMemo, memo } from 'react';
import { toSanHistory } from '../engine/game/moveHistory';

function MoveHistory({ history }) {
  const scrollRef = useRef(null);

  // Performance Optimization (Bolt ⚡):
  // Memoize SAN history conversion to avoid re-instantiating Chess() and replaying
  // move history on every parent component re-render when history has not changed.
  const sanHistory = useMemo(() => toSanHistory(history), [history]);

  // Performance Optimization (Bolt ⚡):
  // Depend effect on sanHistory.length so DOM scroll writes and layout reads only trigger
  // when new moves are added, instead of firing on every re-render.
  const movesCount = sanHistory.length;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [movesCount]);

  // Performance Optimization (Bolt ⚡):
  // Memoize move pairs grouping to prevent re-allocating array/objects when moves haven't changed.
  const movePairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < sanHistory.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: sanHistory[i],
        black: sanHistory[i + 1] || '',
      });
    }
    return pairs;
  }, [sanHistory]);

  return (
    <div className="move-history">
      <h3>Moves</h3>
      <div className="moves-container" ref={scrollRef}>
        {movePairs.length === 0 ? (
          <p className="no-moves">No moves yet</p>
        ) : (
          <div className="moves-list">
            {movePairs.map((pair) => (
              <div key={pair.number} className="move-row">
                <span className="move-number">{pair.number}.</span>
                <span className="white-move">{pair.white}</span>
                <span className="black-move">{pair.black}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Performance Optimization (Bolt ⚡):
// Memoize component to skip re-rendering when parent state changes but history prop is identical.
export default memo(MoveHistory);
