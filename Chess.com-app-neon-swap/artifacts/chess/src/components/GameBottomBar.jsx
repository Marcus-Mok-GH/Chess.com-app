import './GameBottomBar.css';
import haptics from "../utils/haptics";

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
      <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onNew(); }}>
        New
      </button>
      <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onUndo(); }} disabled={!canUndo || isThinking}>
        Undo
      </button>
      <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onFlipBoard(); }}>
        Flip
      </button>
      {showHints && (
        <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onHint(); }} disabled={isThinking}>
          Hint
        </button>
      )}
      <button type="button" className="gbb-btn" onClick={() => { haptics.button(); onReview(); }} disabled={!canReview}>
        Game Review
      </button>
      <button type="button" className="gbb-btn danger" onClick={() => { haptics.button(); onResign(); }} disabled={isThinking}>
        Resign
      </button>
    </div>
  );
}
