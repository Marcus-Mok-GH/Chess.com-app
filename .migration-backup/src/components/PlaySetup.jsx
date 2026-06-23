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
}) {
  const canStart = Boolean(selectedBot) && Boolean(playerColor);

  return (
    <div className="play-setup">
      <div className="play-setup-card">
        <h2 className="play-setup-title">Set up your game</h2>
        <p className="play-setup-subtitle">Choose a bot opponent and your color.</p>

        <BotSelector
          selectedBot={selectedBot}
          onSelectBot={onSelectBot}
          disabled={false}
          customElo={customElo}
          onCustomEloChange={onCustomEloChange}
        />

        <div className="play-setup-section">
          <label className="play-setup-label">Choose your color:</label>
          <div className="color-choice">
            <button
              type="button"
              className={`color-btn ${playerColor === 'w' ? 'selected' : ''}`}
              onClick={() => onSelectColor('w')}
            >
              ♔ White
            </button>
            <button
              type="button"
              className={`color-btn ${playerColor === 'b' ? 'selected' : ''}`}
              onClick={() => onSelectColor('b')}
            >
              ♚ Black
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
