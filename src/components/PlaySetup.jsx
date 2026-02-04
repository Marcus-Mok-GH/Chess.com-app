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
  gameMode = 'bot',
  onModeChange,
  whitePlayerName,
  blackPlayerName,
  onWhiteNameChange,
  onBlackNameChange,
  autoFlip,
  onAutoFlipChange,
}) {
  const isPassAndPlay = gameMode === 'pass';
  const canStart = isPassAndPlay ? Boolean(playerColor) : Boolean(selectedBot) && Boolean(playerColor);
  const subtitle = isPassAndPlay
    ? 'Two players, one device. Pass the move and keep playing.'
    : 'Choose a bot opponent and your color.';

  return (
    <div className="play-setup">
      <div className="play-setup-card">
        <h2 className="play-setup-title">Set up your game</h2>
        <p className="play-setup-subtitle">{subtitle}</p>

        <div className="play-setup-section">
          <label className="play-setup-label">Game mode:</label>
          <div className="mode-choice">
            <button
              type="button"
              className={`mode-btn ${gameMode === 'bot' ? 'selected' : ''}`}
              onClick={() => onModeChange?.('bot')}
            >
              🤖 Vs Bot
            </button>
            <button
              type="button"
              className={`mode-btn ${gameMode === 'pass' ? 'selected' : ''}`}
              onClick={() => onModeChange?.('pass')}
            >
              🤝 Pass &amp; Play
            </button>
          </div>
        </div>

        {!isPassAndPlay && (
          <>
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
          </>
        )}

        {isPassAndPlay && (
          <>
            <div className="play-setup-section">
              <label className="play-setup-label">Player names:</label>
              <div className="player-name-grid">
                <div className="name-field">
                  <span className="name-label">White</span>
                  <input
                    type="text"
                    className="name-input"
                    placeholder="White player"
                    value={whitePlayerName}
                    onChange={(event) => onWhiteNameChange?.(event.target.value)}
                  />
                </div>
                <div className="name-field">
                  <span className="name-label">Black</span>
                  <input
                    type="text"
                    className="name-input"
                    placeholder="Black player"
                    value={blackPlayerName}
                    onChange={(event) => onBlackNameChange?.(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="play-setup-section">
              <label className="play-setup-label">Starting view:</label>
              <div className="color-choice">
                <button
                  type="button"
                  className={`color-btn ${playerColor === 'w' ? 'selected' : ''}`}
                  onClick={() => onSelectColor('w')}
                >
                  ♔ White at bottom
                </button>
                <button
                  type="button"
                  className={`color-btn ${playerColor === 'b' ? 'selected' : ''}`}
                  onClick={() => onSelectColor('b')}
                >
                  ♚ Black at bottom
                </button>
              </div>
            </div>

            <div className="play-setup-section">
              <label className="play-setup-label">Auto flip board:</label>
              <div className="mode-choice">
                <button
                  type="button"
                  className={`mode-btn ${autoFlip ? 'selected' : ''}`}
                  onClick={() => onAutoFlipChange?.(true)}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`mode-btn ${!autoFlip ? 'selected' : ''}`}
                  onClick={() => onAutoFlipChange?.(false)}
                >
                  Off
                </button>
              </div>
            </div>
          </>
        )}

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
