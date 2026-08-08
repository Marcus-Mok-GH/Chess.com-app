import BotSelector from './BotSelector';

import './PlaySetup.css';

export default function PlaySetup({
  selectedBot,
  onSelectBot,
  customElo,
  onCustomEloChange,
  playerColor,
  onSelectColor,
  onStart,
  isLoggedIn,
}) {
  const canStart = Boolean(selectedBot) && Boolean(playerColor);

  return (
    <div className="play-setup">
      <div className="play-setup-card">
        <div>
          <h2 className="play-setup-title">Play Chess</h2>
          <p className="play-setup-subtitle">Choose your opponent and color to start a game.</p>
        </div>

        <div className="play-setup-section">
          <label className="play-setup-label">Choose your opponent:</label>
          <BotSelector
            selectedBot={selectedBot}
            onSelectBot={onSelectBot}
            disabled={false}
            customElo={customElo}
            onCustomEloChange={onCustomEloChange}
            isLoggedIn={isLoggedIn}
          />
        </div>

        <div className="play-setup-section">
          <label className="play-setup-label">Choose your color:</label>
          <div className="color-choice">
            <button
              type="button"
              className={`color-btn ${playerColor === 'w' ? 'selected' : ''}`}
              onClick={() => onSelectColor('w')}
            >
              <span className="color-btn-emoji">♔</span>
              White
            </button>
            <button
              type="button"
              className={`color-btn ${playerColor === 'b' ? 'selected' : ''}`}
              onClick={() => onSelectColor('b')}
            >
              <span className="color-btn-emoji">♚</span>
              Black
            </button>
          </div>
        </div>

        <div className="play-setup-actions">
          <button
            type="button"
            className="start-btn"
            onClick={onStart}
            disabled={!canStart}
          >
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}
