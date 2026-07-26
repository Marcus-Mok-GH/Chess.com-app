import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../../../services/socket';
import pollingService from '../../../services/matchmakingPolling';

export function useMatchmaking(user, isLoggedIn, settings) {
  const [error, setError] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [playersInQueue, setPlayersInQueue] = useState('--');
  const [matchmakingTransport, setMatchmakingTransport] = useState('socket');
  const [matchFound, setMatchFound] = useState(false);

  const searchTimeInterval = useRef(null);
  const matchmakingSessionId = useRef(
    typeof crypto !== 'undefined'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const pendingMatchmakingRef = useRef(false);
  const activePlayerIdRef = useRef(null);
  // Incremented on every start/cancel so stale match_found callbacks
  // arriving after a cancel are ignored.
  const generationRef = useRef(0);

  const clearMatchmakingTimers = useCallback(() => {
    if (searchTimeInterval.current) {
      clearInterval(searchTimeInterval.current);
      searchTimeInterval.current = null;
    }
  }, []);

  const handleCancelMatchmaking = useCallback(async () => {
    // Immediately invalidate any in-flight match_found events
    generationRef.current++;
    pendingMatchmakingRef.current = false;
    clearMatchmakingTimers();

    // Reset UI state synchronously before the async leave
    setSearchTime(0);
    setError('');
    setMatchFound(false);
    setPlayersInQueue('--');
    setIsWaiting(false);

    const pid = activePlayerIdRef.current;
    activePlayerIdRef.current = null;

    if (pid) {
      // Fire-and-forget: leave is best-effort; don't block UI on network
      pollingService.leaveMatchmaking(pid).catch(() => {});
      socketService.leaveMatchmaking(pid);
    }
  }, [clearMatchmakingTimers]);

  const startMatchmaking = useCallback(async () => {
    const gen = ++generationRef.current;
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

    activePlayerIdRef.current = newPlayerId;

    const joined = await pollingService.joinMatchmaking(newPlayerId, currentName, currentElo, true);
    // If generation changed while we were awaiting, user already cancelled
    if (gen !== generationRef.current) return false;

    if (!joined) {
      setError('Failed to join matchmaking. Please try again.');
      activePlayerIdRef.current = null;
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
      // Cleanup on unmount — leave queue, clear timers
      if (searchTimeInterval.current) clearInterval(searchTimeInterval.current);
      const pid = activePlayerIdRef.current;
      if (pid) {
        pollingService.leaveMatchmaking(pid).catch(() => {});
        socketService.leaveMatchmaking(pid);
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
    matchFound,
    setMatchFound,
    startMatchmaking,
    handleCancelMatchmaking,
    pendingMatchmakingRef,
    clearMatchmakingTimers,
    generationRef,
    activePlayerIdRef,
  };
}
