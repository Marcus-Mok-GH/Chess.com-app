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
      <h2>Play Chess</h2>
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
  );
}
