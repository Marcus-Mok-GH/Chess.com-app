import ChessPieceIcon from './ChessPieceIcon';
import { getBotRatingDisplay } from '../engine/bots/bots';
import { useT } from '../i18n/I18nContext';

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
  showHints = true,
}) {
  const t = useT();
  const getStatusMessage = () => {
    const sideName = (color) => (color === 'w' ? t('White') : t('Black'));
    if (gameStatus === 'resigned') {
      return (
        <>
          <ChessPieceIcon piece="K" color={playerColor === 'w' ? 'b' : 'w'} size={20} />
          {' '}{t('{player} wins by resignation!', { player: sideName(playerColor === 'w' ? 'b' : 'w') })}
        </>
      );
    }
    if (gameStatus === 'checkmate') {
      return (
        <>
          <ChessPieceIcon piece="K" color={turn === 'w' ? 'b' : 'w'} size={20} />
          {' '}{t('{player} wins by checkmate!', { player: sideName(turn === 'w' ? 'b' : 'w') })}
        </>
      );
    }
    if (gameStatus === 'stalemate') return t('½-½ Stalemate!');
    if (gameStatus === 'draw') return t('½-½ Draw!');
    if (gameStatus === 'check') {
      return (
        <>
          <ChessPieceIcon piece="K" color={turn} size={20} />
          {' '}{t('{player} is in check!', { player: sideName(turn) })}
        </>
      );
    }
    return (
      <>
        <ChessPieceIcon piece="K" color={turn} size={20} />
        {' '}{t("It is {player}'s turn", { player: sideName(turn) })}
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
      <div className="bot-display-wrapper">
        <div className="bot-display" style={{ '--bot-color': selectedBot.color }}>
          <div className="bot-avatar-large">{selectedBot.avatar}</div>
          <div className="bot-details">
            <span className="bot-name-large">{t(selectedBot.name)}</span>
            <span className="bot-rating-badge">{t("Rating:")}{' '}{getBotRatingDisplay(selectedBot)}</span>
          </div>
        </div>

        {botMessage && (
          <div className="bot-message">
            <span className="bot-quote">"{t(botMessage)}"</span>
          </div>
        )}
      </div>

      <div className={`game-status ${getStatusClass()}`}>
        {getStatusMessage()}
        {isThinking && <span className="thinking">{t('{name} is thinking...', { name: t(selectedBot.name) })}</span>}
      </div>

      <div className="player-info">
        <span className="player-badge">
          {t("You play as:")}{' '}<ChessPieceIcon piece="K" color={playerColor} size={18} /> {playerColor === 'w' ? t('White') : t('Black')}
        </span>
      </div>

      <div className="control-buttons">
        <button onClick={onNewGame} className="btn btn-primary">
          {t("New Game")}</button>
        <button
          onClick={onUndo}
          className="btn btn-secondary"
          disabled={!canUndo || isThinking || isGameOver}
        >
          {t("Undo")}</button>
        <button onClick={onFlipBoard} className="btn btn-secondary">
          {t("Flip Board")}</button>
        {showHints && (
          <button 
            onClick={onGetHint} 
            className="btn btn-secondary"
            disabled={isThinking || isGameOver}
          >
            {t("💡 Hint")}</button>
        )}
        {!isGameOver && (
          <button 
            onClick={onResign} 
            className="btn btn-danger"
            disabled={isThinking}
          >
            {t("🏳️ Resign")}</button>
        )}
      </div>
    </div>
  );
}
