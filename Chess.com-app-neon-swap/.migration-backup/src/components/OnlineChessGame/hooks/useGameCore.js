import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { buildGameFromHistory, normalizeMoveHistory, toStoredMoveHistory } from '../../../engine/game/moveHistory';
import socketService from '../../../services/socket';
import { playSoundEffect } from '../../../utils/sound';

export function useGameCore(gameId, playerId, playerColor, settings) {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState([]);
  const [gameStatus, setGameStatus] = useState('playing');
  const [endReason, setEndReason] = useState(null);
  const [winner, setWinner] = useState(null);
  const [moveError, setMoveError] = useState('');

  const moveErrorTimeoutRef = useRef(null);
  const colorCode = playerColor === 'white' ? 'w' : 'b';

  const makeMove = useCallback((moveAttempt) => {
    if (game.turn() !== colorCode || game.isGameOver() || gameStatus !== 'playing') return false;

    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    const move = gameCopy.move(moveAttempt);

    if (move) {
      // Small delay to allow local animation to start
      setGame(gameCopy);
      const newHistory = gameCopy.history({ verbose: true });
      setMoveHistory(newHistory);

      socketService.makeMove(
        gameId,
        gameCopy.fen(),
        { from: move.from, to: move.to, promotion: move.promotion, san: move.san },
        toStoredMoveHistory(newHistory),
        playerId
      );

      playSoundEffect(settings, { type: move.captured ? 'capture' : 'move' });
      if (gameCopy.inCheck()) playSoundEffect(settings, { type: 'check' });

      if (gameCopy.isGameOver()) {
        let result = 'draw';
        let reason = 'draw';
        if (gameCopy.isCheckmate()) {
          result = gameCopy.turn() === 'w' ? 'black' : 'white';
          reason = 'checkmate';
        } else if (gameCopy.isStalemate()) {
          reason = 'stalemate';
        }
        socketService.endGame(gameId, result, reason);
      }
      return true;
    }
    return false;
  }, [game, colorCode, gameStatus, moveHistory, gameId, playerId, settings]);

  return {
    game, setGame,
    moveHistory, setMoveHistory,
    gameStatus, setGameStatus,
    endReason, setEndReason,
    winner, setWinner,
    moveError, setMoveError,
    makeMove, colorCode
  };
}
