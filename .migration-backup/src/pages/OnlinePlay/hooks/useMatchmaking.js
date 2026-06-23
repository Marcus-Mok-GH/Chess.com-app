import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../../../services/socket';
import pollingService from '../../../services/matchmakingPolling';

export function useMatchmaking(user, isLoggedIn, settings) {
  const [error, setError] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [playersInQueue, setPlayersInQueue] = useState('--');
  const [matchmakingTransport, setMatchmakingTransport] = useState('socket');
  const [playerId, setPlayerId] = useState(null);
  const [matchFound, setMatchFound] = useState(false);

  const searchTimeInterval = useRef(null);
  const matchmakingSessionId = useRef(
    typeof crypto !== 'undefined'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const pendingMatchmakingRef = useRef(false);

  const clearMatchmakingTimers = useCallback(() => {
    if (searchTimeInterval.current) {
      clearInterval(searchTimeInterval.current);
      searchTimeInterval.current = null;
    }
  }, []);

  const handleCancelMatchmaking = useCallback(async () => {
    clearMatchmakingTimers();
    pendingMatchmakingRef.current = false;

    if (playerId) {
      await pollingService.leaveMatchmaking(playerId);
      socketService.leaveMatchmaking(playerId);
    }

    setSearchTime(0);
    setError('');
    setMatchFound(false);
    setPlayersInQueue('--');
    return true;
  }, [clearMatchmakingTimers, playerId]);

  const startMatchmaking = useCallback(async () => {
    setMatchmakingTransport('polling');
    setError('');
    setSearchTime(0);
    setMatchFound(false);

    if (!isLoggedIn || !user) {
      setError('Sign in required for matchmaking.');
      return false;
    }

    const currentElo = user.elo;
    const currentName = user.username;
    const newPlayerId = `user_${user.id}_${matchmakingSessionId.current}`;

    setPlayerId(newPlayerId);

    const joined = await pollingService.joinMatchmaking(newPlayerId, currentName, currentElo, true);
    if (!joined) {
      setError('Failed to join matchmaking. Please try again.');
      return false;
    }

    pendingMatchmakingRef.current = true;

    searchTimeInterval.current = setInterval(() => {
      setSearchTime(prev => prev + 1);
    }, 1000);

    return true;
  }, [isLoggedIn, user]);

  useEffect(() => {
    return () => {
      if (searchTimeInterval.current) {
        clearInterval(searchTimeInterval.current);
      }
    };
  }, []);

  return {
    error,
    setError,
    searchTime,
    playersInQueue,
    setPlayersInQueue,
    matchmakingTransport,
    setMatchmakingTransport,
    playerId,
    setPlayerId,
    matchFound,
    setMatchFound,
    startMatchmaking,
    handleCancelMatchmaking,
    pendingMatchmakingRef,
    clearMatchmakingTimers
  };
}
