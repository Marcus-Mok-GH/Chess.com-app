import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { buildGameFromHistory, normalizeMoveHistory, toStoredMoveHistory } from '../../../engine/game/moveHistory';
import socketService from '../../../services/socket';
import { playSoundEffect } from '../../../utils/sound';
import api from '../../../services/api';
import {
  loadOnlineGameState,
  saveOnlineGameState,
  clearOnlineGameState,
  clearOnlineSession,
} from '../../../utils/gamePersistence';

export function useGameCore(gameId, playerId, playerColor, settings) {
  // Restore last known board state immediately on refresh (before socket/DB responds)
  const restored = useMemo(() => {
    if (!gameId) return null;
    return loadOnlineGameState(gameId);
  }, [gameId]);

  const initialHistory = restored ? normalizeMoveHistory(restored.moveHistory) : [];
  const initialGame = (() => {
    try {
      if (restored && (initialHistory.length > 0 || restored.fen)) {
        return buildGameFromHistory(initialHistory, restored.fen);
      }
      return new Chess();
    } catch {
      return new Chess();
    }
  })();

  const [game, setGame] = useState(initialGame);
  const [moveHistory, setMoveHistory] = useState(initialHistory);
  const [gameStatus, setGameStatus] = useState(restored?.gameStatus || 'playing');
  const [endReason, setEndReason] = useState(null);
  const [winner, setWinner] = useState(null);
  const [moveError, setMoveError] = useState('');

  const moveErrorTimeoutRef = useRef(null);
  const colorCode = playerColor === 'white' ? 'w' : 'b';

  const persistSnapshot = useCallback((nextGame, nextHistory, status = 'playing', meta = {}) => {
    if (!gameId || !nextGame) return;
    saveOnlineGameState(gameId, {
      fen: nextGame.fen(),
      moveHistory: toStoredMoveHistory(nextHistory),
      gameStatus: status,
      whitePlayer: meta.whitePlayer,
      blackPlayer: meta.blackPlayer,
    });
  }, [gameId]);

  // Keep local snapshot in sync whenever server/socket updates state
  useEffect(() => {
    if (!gameId || !game) return;
    persistSnapshot(game, moveHistory, gameStatus);
  }, [gameId, game, moveHistory, gameStatus, persistSnapshot]);

  // Clear local online session when the game ends
  useEffect(() => {
    if (gameStatus === 'ended' && gameId) {
      // Keep the board snapshot for a bit (analysis) but drop the "active session"
      clearOnlineSession();
    }
  }, [gameStatus, gameId]);

  const makeMove = useCallback(async (moveAttempt) => {
    if (game.turn() !== colorCode || game.isGameOver() || gameStatus !== 'playing') return false;

    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    const move = gameCopy.move(moveAttempt);

    if (move) {
      setGame(gameCopy);
      const newHistory = gameCopy.history({ verbose: true });
      const storedHistory = toStoredMoveHistory(newHistory);
      setMoveHistory(newHistory);

      // Immediate local persist (survives refresh even if network is flaky)
      persistSnapshot(gameCopy, newHistory, 'playing');

      socketService.makeMove(
        gameId,
        gameCopy.fen(),
        { from: move.from, to: move.to, promotion: move.promotion, san: move.san },
        storedHistory,
        playerId
      );

      try {
        await api.saveGame({
          gameCode: gameId,
          moveHistory: storedHistory,
          result: 'in_progress',
          gameMode: 'online',
          userId: playerId?.startsWith?.('user_') ? playerId.replace('user_', '') : null,
          playerColor: playerColor,
          finalFen: gameCopy.fen(),
        });
      } catch (err) {
        console.warn('[OnlineGame] DB persist fallback failed:', err);
      }

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
        setGameStatus('ended');
        setEndReason(reason);
        setWinner(result);
        persistSnapshot(gameCopy, newHistory, 'ended');
        clearOnlineSession();
        socketService.endGame(gameId, result, reason, playerId);
      }
      return true;
    }
    return false;
  }, [game, colorCode, gameStatus, moveHistory, gameId, playerId, settings, playerColor, persistSnapshot]);

  return {
    game, setGame,
    moveHistory, setMoveHistory,
    gameStatus, setGameStatus,
    endReason, setEndReason,
    winner, setWinner,
    moveError, setMoveError,
    makeMove, colorCode,
    persistSnapshot,
    restoredMeta: restored,
  };
}
