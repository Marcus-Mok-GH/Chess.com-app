import BotSelector from './BotSelector';

import './PlaySetup.css';

export default function PlaySetup({
  gameMode = 'bot',
  onSelectGameMode,
  whiteName = 'Player 1',
  onWhiteNameChange,
  blackName = 'Player 2',
  onBlackNameChange,
  autoRotate = true,
  onAutoRotateChange,
  selectedBot,
  onSelectBot,
  customElo,
  onCustomEloChange,
  playerColor = 'w',
  onSelectColor,
  onStart,
  isLoggedIn,
}) {
  const canStart = gameMode === 'pass_and_play'
    ? Boolean(whiteName?.trim()) && Boolean(blackName?.trim())
    : Boolean(selectedBot) && Boolean(playerColor);

  return (
    <div className="play-setup">
      <div className="play-setup-card">
        <div>
          <h2 className="play-setup-title">Play Chess</h2>
          <p className="play-setup-subtitle">
            {gameMode === 'pass_and_play'
              ? 'Play locally with two players on the same device.'
              : 'Choose your opponent and color to start a game.'}
          </p>
        </div>

        {/* Mode Selector */}
        <div className="play-setup-section">
          <h3 className="play-setup-label">Game Mode</h3>
          <div className="mode-toggle" role="tablist" aria-label="Game Mode Selection">
            <button
              type="button"
              role="tab"
              aria-selected={gameMode === 'bot'}
              className={`mode-btn ${gameMode === 'bot' ? 'active' : ''}`}
              onClick={() => onSelectGameMode?.('bot')}
            >
              <span className="mode-icon" aria-hidden="true">🤖</span>
              <span>Vs Computer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={gameMode === 'pass_and_play'}
              className={`mode-btn ${gameMode === 'pass_and_play' ? 'active' : ''}`}
              onClick={() => onSelectGameMode?.('pass_and_play')}
            >
              <span className="mode-icon" aria-hidden="true">📱</span>
              <span>Pass & Play</span>
            </button>
          </div>
        </div>

        {gameMode === 'pass_and_play' ? (
          <>
            {/* Player Names */}
            <div className="play-setup-section">
              <h3 className="play-setup-label">Player Names</h3>
              <div className="players-inputs-grid">
                <div className="player-input-group">
                  <label htmlFor="white-player-input" className="player-input-label">
                    <span className="color-dot white-dot" aria-hidden="true">♔</span>
                    White Player
                  </label>
                  <input
                    id="white-player-input"
                    type="text"
                    className="player-name-input"
                    value={whiteName}
                    onChange={(e) => onWhiteNameChange?.(e.target.value)}
                    placeholder="White Player Name"
                    maxLength={24}
                  />
                </div>

                <div className="player-input-group">
                  <label htmlFor="black-player-input" className="player-input-label">
                    <span className="color-dot black-dot" aria-hidden="true">♚</span>
                    Black Player
                  </label>
                  <input
                    id="black-player-input"
                    type="text"
                    className="player-name-input"
                    value={blackName}
                    onChange={(e) => onBlackNameChange?.(e.target.value)}
                    placeholder="Black Player Name"
                    maxLength={24}
                  />
                </div>
              </div>
            </div>

            {/* Rotation Settings */}
            <div className="play-setup-section">
              <h3 className="play-setup-label">Board Rotation</h3>
              <label className="autorotate-toggle">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(e) => onAutoRotateChange?.(e.target.checked)}
                />
                <span className="autorotate-label-text">
                  <strong>Auto-rotate board after each turn</strong>
                  <span className="autorotate-help">Flips the board so it always faces the player whose turn it is.</span>
                </span>
              </label>
            </div>
          </>
        ) : (
          <>
            {/* Bot Opponent Selector */}
            <div className="play-setup-section">
              <h3 className="play-setup-label">Opponent</h3>
              <BotSelector
                selectedBot={selectedBot}
                onSelectBot={onSelectBot}
                disabled={false}
                customElo={customElo}
                onCustomEloChange={onCustomEloChange}
                isLoggedIn={isLoggedIn}
              />
            </div>

            {/* Color Selector */}
            <div className="play-setup-section">
              <h3 className="play-setup-label">Color</h3>
              <div className="color-choice">
                <button
                  type="button"
                  className={`color-btn ${playerColor === 'w' ? 'selected' : ''}`}
                  onClick={() => onSelectColor('w')}
                  aria-pressed={playerColor === 'w'}
                >
                  <span className="color-btn-emoji" aria-hidden="true">♔</span>
                  White
                </button>
                <button
                  type="button"
                  className={`color-btn ${playerColor === 'b' ? 'selected' : ''}`}
                  onClick={() => onSelectColor('b')}
                  aria-pressed={playerColor === 'b'}
                >
                  <span className="color-btn-emoji" aria-hidden="true">♚</span>
                  Black
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
