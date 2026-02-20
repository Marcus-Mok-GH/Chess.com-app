import './GameBottomBar.css';

export default function GameBottomBar({
  onNew,
  onFlipBoard,
  onUndo,
  onHint,
  onResign,
  onReview,
  canUndo,
  isThinking,
  canReview,
  showHints = true,
  botMessage,
  selectedBot,
}) {
  return (
    <div className="game-bottom-bar" role="navigation" aria-label="Game controls">
      {botMessage && selectedBot && (
        <div className="gbb-bot-message">
          <span className="gbb-bot-avatar" style={{ background: selectedBot.color }}>{selectedBot.avatar}</span>
          <div className="gbb-bot-text">
            <span className="gbb-bot-name">{selectedBot.name}</span>
            <span className="gbb-bot-quote">"{botMessage}"</span>
          </div>
        </div>
      )}
      <button type="button" className="gbb-btn" onClick={onNew}>
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
