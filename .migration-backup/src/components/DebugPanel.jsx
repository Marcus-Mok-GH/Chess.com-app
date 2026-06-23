export default function DebugPanel({ debugInfo, isThinking }) {
  if (!debugInfo) return null;

  const { moves, depth, time, bestMove, current, progress, evaluating } = debugInfo;

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <span className="debug-title">🔍 AI Debug</span>
        {isThinking && <span className="debug-thinking">{evaluating || 'calculating...'}</span>}
      </div>

      {isThinking && progress !== undefined && progress < 1 && (
        <div className="debug-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          {current && <span className="current-move">Evaluating: <strong>{current}</strong></span>}
        </div>
      )}
      
      <div className="debug-stats">
        <div className="debug-stat">
          <span className="stat-label">Depth</span>
          <span className="stat-value">{depth}</span>
        </div>
        <div className="debug-stat">
          <span className="stat-label">Time</span>
          <span className="stat-value">{time}ms</span>
        </div>
        <div className="debug-stat">
          <span className="stat-label">Best</span>
          <span className="stat-value best-move">{bestMove || '...'}</span>
        </div>
      </div>

      <div className="debug-moves">
        <div className="debug-moves-header">
          <span>Move</span>
          <span>Eval</span>
        </div>
        <div className="debug-moves-list">
          {moves && moves.slice(0, 10).map((m, i) => (
            <div key={i} className={`debug-move ${m.move === bestMove ? 'best' : ''} ${m.move === current ? 'evaluating' : ''}`}>
              <span className="move-name">
                {m.move === current && '→ '}
                {m.move}
              </span>
              <span className={`move-eval ${m.value > 0 ? 'positive' : m.value < 0 ? 'negative' : ''}`}>
                {m.value > 0 ? '+' : ''}{(m.value / 100).toFixed(2)}
              </span>
            </div>
          ))}
          {moves && moves.length > 10 && (
            <div className="debug-move more">
              <span className="move-name">... {moves.length - 10} more</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
