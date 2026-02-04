import ChessPieceIcon from './ChessPieceIcon';

export default function GameControls({
  gameStatus,
  turn,
  playerColor,
  selectedBot,
  botMessage,
  onNewGame,
  onUndo,
  onFlipBoard,
  onGetHint,
  onResign,
  isThinking,
  canUndo,
  onReview,
  showHints = true,
  canAnalyze = true,
  canReview = false,
  gameMode = 'bot',
  whitePlayerName,
  blackPlayerName,
  resignedColor,
}) {
  const isPassAndPlay = gameMode === 'pass';
  const getSideLabel = (color) => {
    if (!isPassAndPlay) {
      return color === 'w' ? 'White' : 'Black';
    }
    const name = color === 'w' ? whitePlayerName : blackPlayerName;
    const safeName = (name || (color === 'w' ? 'White' : 'Black')).trim() || (color === 'w' ? 'White' : 'Black');
    return `${safeName} (${color === 'w' ? 'White' : 'Black'})`;
  };

  const getStatusMessage = () => {
    if (gameStatus === 'resigned') {
      const resignedSide = resignedColor || playerColor;
      const winnerSide = resignedSide === 'w' ? 'b' : 'w';
      return (
        <>
          <ChessPieceIcon piece="K" color={winnerSide} size={20} />
          {' '}{getSideLabel(winnerSide)} wins by resignation!
        </>
      );
    }
    if (gameStatus === 'checkmate') {
      return (
        <>
          <ChessPieceIcon piece="K" color={turn === 'w' ? 'b' : 'w'} size={20} />
          {' '}{getSideLabel(turn === 'w' ? 'b' : 'w')} wins by checkmate!
        </>
      );
    }
    if (gameStatus === 'stalemate') return '½-½ Stalemate!';
    if (gameStatus === 'draw') return '½-½ Draw!';
    if (gameStatus === 'check') {
      return (
        <>
          <ChessPieceIcon piece="K" color={turn} size={20} />
          {' '}{getSideLabel(turn)} is in check!
        </>
      );
    }
    return (
      <>
        <ChessPieceIcon piece="K" color={turn} size={20} />
        {' '}{getSideLabel(turn)} to move
      </>
    );
  };

  const getStatusClass = () => {
    if (gameStatus === 'checkmate' || gameStatus === 'resigned') return 'status-checkmate';
    if (gameStatus === 'stalemate' || gameStatus === 'draw') return 'status-draw';
    if (gameStatus === 'check') return 'status-check';
    return '';
  };

  const isGameOver = gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw' || gameStatus === 'resigned';

  return (
    <div className="game-controls">
      {!isPassAndPlay ? (
        <div className="bot-display-wrapper">
          <div className="bot-display" style={{ '--bot-color': selectedBot.color }}>
            <div className="bot-avatar-large">{selectedBot.avatar}</div>
            <div className="bot-details">
              <span className="bot-name-large">{selectedBot.name}</span>
              <span className="bot-rating-badge">Rating: {selectedBot.rating}</span>
            </div>
          </div>

          {botMessage && (
            <div className="bot-message">
              <span className="bot-quote">"{botMessage}"</span>
            </div>
          )}
        </div>
      ) : (
        <div className="pass-play-banner">
          <span className="pass-play-title">Pass &amp; Play</span>
          <span className="pass-play-players">
            {getSideLabel('w')} vs {getSideLabel('b')}
          </span>
        </div>
      )}

      <div className={`game-status ${getStatusClass()}`}>
        {getStatusMessage()}
        {!isPassAndPlay && isThinking && <span className="thinking">{selectedBot.name} is thinking...</span>}
      </div>

      {!isPassAndPlay && (
        <div className="player-info">
          <span className="player-badge">
            You play as: <ChessPieceIcon piece="K" color={playerColor} size={18} /> {playerColor === 'w' ? 'White' : 'Black'}
          </span>
        </div>
      )}

      <div className="control-buttons">
        <button onClick={onNewGame} className="btn btn-primary">
          New Game
        </button>
        <button
          onClick={onUndo}
          className="btn btn-secondary"
          disabled={!canUndo || isThinking || isGameOver}
        >
          Undo
        </button>
        <button onClick={onFlipBoard} className="btn btn-secondary">
          Flip Board
        </button>
        {showHints && (
          <button 
            onClick={onGetHint} 
            className="btn btn-secondary"
            disabled={isThinking || isGameOver}
          >
            💡 Hint
          </button>
        )}
        {!isGameOver && (
          <button 
            onClick={onResign} 
            className="btn btn-danger"
            disabled={isThinking}
          >
            🏳️ Resign
          </button>
        )}
        <button
          onClick={onReview}
          className="btn btn-primary"
          disabled={!canAnalyze || !canReview}
        >
          🧠 Game Review
        </button>
      </div>
    </div>
  );
}
