import haptics from '../../../utils/haptics';
import React from 'react';
import PlayerBar from '../../PlayerBar';
import ChessBoard from '../../ChessBoard';
import AnimatedPiece from '../../AnimatedPiece';
import ChessPieceIcon from '../../ChessPieceIcon';
import MoveHistory from '../../MoveHistory';
import { isOnlineGameActive } from '../onlineGameStatus';
import {
  isTimedControl,
  timeControlLabel,
  timeControlDescription,
} from '../../../utils/timeControls';
import { REACTIONS, reactionEmoji, displayChatBody } from '../onlineReactions';
import api from '../../../services/api';
import { useT } from '../../../i18n/I18nContext';
import { tNow } from '../../../i18n/translate';

export default function GameUI({
  topPlayer, bottomPlayer, game, onSquareClick, onPieceDrop, canDragPiece,
  boardOrientation, customSquareStyles, settings, animatingPieces,
  removeAnimation, showVictory, gameId, opponentStatus, eloChange,
  moveError, getStatusMessage, drawOffered, handleRespondDraw,
  handleSendReaction, reactionBursts = [], moveHistory, gameStatus,
  capturedPieces, chatMessages, handleSendMessage, playerId,
  handleOfferDraw, handleResign, onLeave, canLeave, chatEnabled,
  liveClock = null, timeControl = null,
}) {
  const t = useT();
  // Only timed games show clocks, and each player bar shows the clock for the
  // color it represents (the bars swap with the board orientation).
  const clockFor = (playerColor) => {
    if (!liveClock?.limited) return { clockMs: null, clockActive: false };
    const isWhite = playerColor === 'w';
    return {
      clockMs: isWhite ? liveClock.whiteMs : liveClock.blackMs,
      clockActive: gameStatus === 'playing' && liveClock.side === (isWhite ? 'white' : 'black'),
    };
  };

  const [chatInput, setChatInput] = React.useState('');
  const [reportReason, setReportReason] = React.useState('engine_assistance');
  const [reportDetails, setReportDetails] = React.useState('');
  const [reportStatus, setReportStatus] = React.useState('');
  const chatEndRef = React.useRef(null);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const onReport = async () => {
    try {
      const token = localStorage.getItem('chess_user_token');
      await api.reportFairPlay({ gameId, reason: reportReason, details: reportDetails, token });
      setReportStatus(tNow('Report submitted for private review.'));
      setReportDetails('');
    } catch (error) {
      setReportStatus(error?.message || 'Could not submit report');
    }
  };

  const onSend = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      handleSendMessage(chatInput);
      setChatInput('');
    }
  };

  return (
    <div className="game-container">
      <div className="board-section">
        <PlayerBar
          {...topPlayer}
          isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}
          capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}
          {...clockFor(topPlayer.color)}
        />
        <div className="board-wrapper">
          <ChessBoard
            position={game}
            onSquareClick={onSquareClick}
            onPieceDrop={onPieceDrop}
            canDragPiece={canDragPiece}
            boardOrientation={boardOrientation}
            customSquareStyles={customSquareStyles}
            showCoordinates={settings.showCoordinates}
            boardTheme={settings.boardTheme}
          />
          {animatingPieces.map((anim) => (
            <AnimatedPiece
              key={anim.id}
              piece={anim.piece}
              fromSquare={anim.fromSquare}
              toSquare={anim.toSquare}
              boardOrientation={boardOrientation}
              captured={anim.captured}
              onComplete={() => removeAnimation(anim.id)}
            />
          ))}
          {reactionBursts.map((burst) => (
            <div
              key={burst.id}
              className={`reaction-burst${burst.mine ? ' mine' : ''}`}
              style={{ left: `${burst.offsetPct}%` }}
              aria-hidden="true"
            >
              {burst.emoji}
            </div>
          ))}
          {showVictory && <div className="victory-burst">{t("Checkmate!")}</div>}
        </div>
        <PlayerBar
          {...bottomPlayer}
          isActive={game.turn() === (boardOrientation === 'white' ? 'w' : 'b')}
          capturedPieces={capturedPieces[bottomPlayer.color === 'w' ? 'b' : 'w']}
          {...clockFor(bottomPlayer.color)}
        />
      </div>

      <div className="sidebar">
        <div className="online-game-info">
          <div>{t("Game Code:")}{' '}{gameId}</div>
          {isTimedControl(timeControl) && (
            <div>
              {t(timeControlLabel(timeControl))} · {t(timeControlDescription(timeControl))}
            </div>
          )}
          <div className={`status-${opponentStatus}`}>{t('Opponent')} {' '}{t(opponentStatus === 'connected' ? 'Connected' : 'Disconnected')}</div>
          {eloChange !== null && <div>{t("Rating:")}{' '}{eloChange > 0 ? '+' : ''}{eloChange}</div>}
        </div>
        <div className="status-message">{getStatusMessage()}</div>
        {moveError && <div className="error-message">{t(moveError)}</div>}

        {drawOffered && (
          <div className="draw-offer">
            <p>{t("Draw offered")}</p>
            <button onClick={() => handleRespondDraw(true)}>{t("Accept")}</button>
            <button onClick={() => handleRespondDraw(false)}>{t("Decline")}</button>
          </div>
        )}

        {chatEnabled && (
          <div className="reactions" role="group" aria-label={t("Quick reactions")}>
            {REACTIONS.map((r) => (
              <button
                key={r.word}
                type="button"
                onClick={() => handleSendReaction(r.word)}
                title={t(r.label)}
                aria-label={t(r.label)}
              >
                <span aria-hidden="true" className="reaction-emoji">
                  {r.emoji}
                </span>
              </button>
            ))}
          </div>
        )}

        <MoveHistory history={moveHistory} />
        <div className="chat-container">
          <div className="chat-messages">
            {chatMessages
              .filter((msg) => !reactionEmoji(msg.message))
              .map((msg, i) => (
                <div key={msg.id ?? i} className={"chat-message " + (msg.playerId === playerId ? "mine" : "theirs")}>
                  <span className="chat-sender">{t(msg.playerId === playerId ? 'You' : 'Opponent')}:</span>
                  <span className="chat-text">{displayChatBody(msg.message)}</span>
                </div>
              ))}
            <div ref={chatEndRef} />
          </div>
          {chatEnabled && (
            <form onSubmit={onSend} className="chat-input-form">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t("Type a message...")}
                maxLength={500}
              />
              <button type="submit">{t("Send")}</button>
            </form>
          )}
        </div>


        {gameStatus === 'ended' && (
          <div className="fair-play-report">
            <strong>{t("Report fair-play concern")}</strong>
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
              <option value="engine_assistance">{t("Engine assistance")}</option>
              <option value="outside_help">{t("Outside help")}</option>
              <option value="account_sharing">{t("Account sharing")}</option>
              <option value="suspicious_behavior">{t("Suspicious behavior")}</option>
              <option value="other">{t("Other")}</option>
            </select>
            <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} placeholder={t("Optional details")} />
            <button className="online-action-btn" onClick={onReport}>{t("Submit private report")}</button>
            {reportStatus && <div className="status-message">{reportStatus}</div>}
          </div>
        )}

        <div className="controls">
          {isOnlineGameActive(gameStatus) && (
            <>
              <button className="online-action-btn online-action-btn--draw" onClick={handleOfferDraw}>{t("Offer Draw")}</button>
              <button className="online-action-btn online-action-btn--resign" onClick={handleResign}>{t("Resign")}</button>
            </>
          )}
          <button className="online-action-btn online-action-btn--leave" onClick={onLeave} disabled={!canLeave}>{t("Leave")}</button>
        </div>
      </div>
    </div>
  );
}
