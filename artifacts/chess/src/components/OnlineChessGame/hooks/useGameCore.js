import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { buildGameFromHistory, normalizeMoveHistory, toStoredMoveHistory } from '../../../engine/game/moveHistory';
import { playSoundEffect } from '../../../utils/sound';
import api from '../../../services/api';
import {
  loadOnlineGameState,
  saveOnlineGameState,
  clearOnlineGameState,
  clearOnlineSession,
} from '../../../utils/gamePersistence';

const SESSION_TOKEN_KEY = 'chess_user_token';

function getAuthToken() {
  try { return localStorage.getItem(SESSION_TOKEN_KEY) || null; } catch { return null; }
}

export function useGameCore(gameId, playerId, playerColor, settings) {
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
  const moveInFlightRef = useRef(false);
  const colorCode = playerColor === 'white' ? 'w' : 'b';
  const moveCountRef = useRef(initialHistory.length);

  const persistSnapshot = useCallback((nextGame, nextHistory, status = 'playing') => {
    if (!gameId || !nextGame) return;
    saveOnlineGameState(gameId, {
      fen: nextGame.fen(),
      moveHistory: toStoredMoveHistory(nextHistory),
      gameStatus: status,
    });
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !game) return;
    persistSnapshot(game, moveHistory, gameStatus);
  }, [gameId, game, moveHistory, gameStatus, persistSnapshot]);

  useEffect(() => {
    if (gameStatus === 'ended' && gameId) {
      clearOnlineSession();
    }
  }, [gameStatus, gameId]);

  useEffect(() => {
    moveCountRef.current = moveHistory.length;
  }, [moveHistory.length]);

  const makeMove = useCallback(async (moveAttempt) => {
    if (moveInFlightRef.current) return false;
    if (game.turn() !== colorCode || game.isGameOver() || gameStatus !== 'playing') return false;

    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    const move = gameCopy.move(moveAttempt);
    if (!move) return false;

    moveInFlightRef.current = true;

    const storedHistory = toStoredMoveHistory(gameCopy.history({ verbose: true }));

    try {
      const result = await api.postMove({
        gameId,
        move: { from: move.from, to: move.to, promotion: move.promotion || 'q', san: move.san },
        playerId,
        expectedMoveCount: moveCountRef.current,
        token: getAuthToken(),
      });

      if (!result.success) throw new Error(result.error || 'Move rejected');

      const serverHistory = normalizeMoveHistory(result.moveHistory);
      const newGame = buildGameFromHistory(serverHistory, result.fen);

      setGame(newGame);
      setMoveHistory(serverHistory);
      moveCountRef.current = serverHistory.length;

      playSoundEffect(settings, { type: move.captured ? 'capture' : 'move' });
      if (newGame.inCheck()) playSoundEffect(settings, { type: 'check' });

      if (newGame.isGameOver()) {
        let result2 = 'draw';
        let reason = 'draw';
        if (newGame.isCheckmate()) {
          result2 = newGame.turn() === 'w' ? 'black' : 'white';
          reason = 'checkmate';
        } else if (newGame.isStalemate()) {
          reason = 'stalemate';
        }
        setGameStatus('ended');
        setEndReason(reason);
        setWinner(result2);
        clearOnlineSession();
      }

      moveInFlightRef.current = false;
      return true;
    } catch (err) {
      const msg = err?.message || 'Move could not be sent';
      setMoveError(msg);
      if (moveErrorTimeoutRef.current) clearTimeout(moveErrorTimeoutRef.current);
      moveErrorTimeoutRef.current = setTimeout(() => setMoveError(''), 4000);
      moveInFlightRef.current = false;
      return false;
    }
  }, [game, colorCode, gameStatus, moveHistory, gameId, playerId, settings, persistSnapshot]);

  return {
    game, setGame,
    moveHistory, setMoveHistory,
    gameStatus, setGameStatus,
    endReason, setEndReason,
    winner, setWinner,
    moveError, setMoveError,
    makeMove, colorCode,
    moveInFlightRef,
    persistSnapshot,
    restoredMeta: restored,
  };
}
