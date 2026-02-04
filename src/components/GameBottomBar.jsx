import './GameBottomBar.css';

export default function GameBottomBar({
  onSetup,
  onNewGame,
  onFlipBoard,
  onUndo,
  onHint,
  onResign,
  onReview,
  canUndo,
  isThinking,
  canSetup,
  canReview,
  showHints = true,
}) {
  return (
    <div className="game-bottom-bar" role="navigation" aria-label="Game controls">
      <button type="button" className="gbb-btn" onClick={onSetup} disabled={!canSetup}>
        Setup
      </button>
      <button type="button" className="gbb-btn" onClick={onNewGame}>
        New
      </button>
      <button type="button" className="gbb-btn" onClick={onUndo} disabled={!canUndo || isThinking}>
        Undo
      </button>
      <button type="button" className="gbb-btn" onClick={onFlipBoard}>
        Flip
      </button>
      {showHints && (
        <button type="button" className="gbb-btn" onClick={onHint} disabled={isThinking}>
          Hint
        </button>
      )}
      <button type="button" className="gbb-btn" onClick={onReview} disabled={!canReview}>
        Game Review
      </button>
      <button type="button" className="gbb-btn danger" onClick={onResign} disabled={isThinking}>
        Resign
      </button>
    </div>
  );
}
