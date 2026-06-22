import React from 'react';
import PlayerBar from '../../PlayerBar';
import ChessBoard from '../../ChessBoard';
import AnimatedPiece from '../../AnimatedPiece';
import ChessPieceIcon from '../../ChessPieceIcon';
import MoveHistory from '../../MoveHistory';

export default function GameUI({
  topPlayer, bottomPlayer, game, onPieceDrop, onSquareClick,
  boardOrientation, customSquareStyles, settings, animatingPieces,
  removeAnimation, showVictory, gameId, opponentStatus, eloChange,
  moveError, getStatusMessage, drawOffered, handleRespondDraw,
  REACTIONS, handleSendReaction, moveHistory, gameStatus,
  handleOfferDraw, handleResign, navigate, canReview, onLeave,
  capturedPieces
}) {
  return (
    <div className="game-container">
      <div className="board-section">
        <PlayerBar
          {...topPlayer}
          isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}
          capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}
        />
        <div className="board-wrapper">
          <ChessBoard
            position={game}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
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
          {showVictory && <div className="victory-burst">Checkmate!</div>}
        </div>
        <PlayerBar
          {...bottomPlayer}
          isActive={game.turn() === (boardOrientation === 'white' ? 'w' : 'b')}
          capturedPieces={capturedPieces[bottomPlayer.color === 'w' ? 'b' : 'w']}
        />
      </div>

      <div className="sidebar">
        <div className="online-game-info">
          <div>Game Code: {gameId}</div>
          <div className={`status-${opponentStatus}`}>Opponent {opponentStatus}</div>
          {eloChange !== null && <div>Rating: {eloChange > 0 ? '+' : ''}{eloChange}</div>}
        </div>
        <div className="status-message">{getStatusMessage()}</div>
        {moveError && <div className="error-message">{moveError}</div>}

        {drawOffered && (
          <div className="draw-offer">
            <p>Draw offered</p>
            <button onClick={() => handleRespondDraw(true)}>Accept</button>
            <button onClick={() => handleRespondDraw(false)}>Decline</button>
          </div>
        )}

        <div className="reactions">
          {REACTIONS.map(r => <button key={r} onClick={() => handleSendReaction(r)}>{r}</button>)}
        </div>

        <MoveHistory history={moveHistory} />

        <div className="controls">
          {gameStatus === 'playing' && (
            <>
              <button onClick={handleOfferDraw}>Offer Draw</button>
              <button onClick={handleResign}>Resign</button>
            </>
          )}
          <button onClick={() => navigate(`/analysis/${gameId}`, { state: { moveHistory } })} disabled={!canReview}>Review</button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}
