import React from 'react';

export default function LobbyUI({
  isLoggedIn,
  user,
  playerElo,
  error,
  handleSelectMode,
  navigate
}) {
  return (
    <div className="lobby-container">
      <div className="lobby-content mode-select-content">
        <div className="elo-display">
          <span className="elo-label">{isLoggedIn ? user.username : 'Your Rating'}</span>
          <span className="elo-value">{isLoggedIn ? user.elo : playerElo}</span>
        </div>

        <h2 className="mode-title">Choose Game Mode</h2>

        {error && error.toLowerCase().includes('unable to connect') && (
          <div className="error-message error-message-important">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{error}</div>
          </div>
        )}
        {(!error || !error.toLowerCase().includes('unable to connect')) && (
          error && <div className="error-message">{error}</div>
        )}

        <div className="mode-options">
          <button
            className="mode-option ranked"
            onClick={() => handleSelectMode('ranked')}
          >
            <div className="mode-icon">⚔️</div>
            <div className="mode-info">
              <h3>Ranked</h3>
              <p>Competitive matchmaking based on ELO rating. Win to climb the ladder!</p>
              {!isLoggedIn && <span className="login-required">Sign in required</span>}
            </div>
          </button>

          <button
            className="mode-option friendly"
            onClick={() => handleSelectMode('friendly')}
          >
            <div className="mode-icon">🤝</div>
            <div className="mode-info">
              <h3>Friendly</h3>
              <p>Casual games with friends. Create a game or join with a code.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
