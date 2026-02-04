import { useEffect, useRef } from 'react';
import { toSanHistory } from '../engine/game/moveHistory';

export default function MoveHistory({ history }) {
  const scrollRef = useRef(null);

  const sanHistory = toSanHistory(history);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sanHistory]);

  const movePairs = [];
  for (let i = 0; i < sanHistory.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: sanHistory[i],
      black: sanHistory[i + 1] || '',
    });
  }

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
