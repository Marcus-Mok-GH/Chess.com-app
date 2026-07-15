import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import OnlineChessGame from '../components/OnlineChessGame';
import { useSettings } from '../contexts/SettingsContext';
import { playMatchFoundSound } from '../utils/sound';
import LoginModal from '../components/LoginModal';
import { useUser } from '../contexts/UserContext';
import socketService from '../services/socket';
import pollingService from '../services/matchmakingPolling';
import api from '../services/api';
import {
  saveOnlineSession,
  loadOnlineSession,
  clearOnlineSession,
  clearOnlineGameState,
} from '../utils/gamePersistence';

import { useMatchmaking } from './OnlinePlay/hooks/useMatchmaking';
import LobbyUI from './OnlinePlay/subcomponents/LobbyUI';
import './OnlinePlay.css';

export default function OnlinePlay() {
  const [searchParams] = useSearchParams();
  const { gameId: routeGameId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, isLoggedIn } = useUser();
  const isGuest = !isLoggedIn;

  const restoredSession = useRef(null);
  if (restoredSession.current === null) {
    restoredSession.current = loadOnlineSession();
  }
  const savedSession = restoredSession.current;

  const [view, setView] = useState(() => {
    if (routeGameId) return 'playing';
    // Resume active online session after refresh when still on /online
    if (savedSession?.gameId && !routeGameId) return 'playing';
    return 'mode-select';
  });
  const [gameMode, setGameMode] = useState(null);
  const [gameId, setGameId] = useState(() => {
    if (routeGameId) return routeGameId.toUpperCase();
    if (savedSession?.gameId) return savedSession.gameId;
    return null;
  });
  const [playerColor, setPlayerColor] = useState(() => {
    if (savedSession?.playerColor) return savedSession.playerColor;
    try {
      return localStorage.getItem('last_chess_color') || null;
    } catch {
      return null;
    }
  });
  const [joinCode, setJoinCode] = useState('');
  const [selectedColor, setSelectedColor] = useState('white');
  const [playerElo, setPlayerElo] = useState(() => user?.elo || 1200);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [showMatchFoundAnimation, setShowMatchFoundAnimation] = useState(false);
  const [foundOpponent, setFoundOpponent] = useState(null);
  const [opponentInfo, setOpponentInfo] = useState(() => savedSession?.opponentInfo || null);
  const [isWaiting, setIsWaiting] = useState(false);

  const [playerId, setPlayerId] = useState(() => {
    if (user) return `user_${user.id}`;
    if (savedSession?.playerId) return savedSession.playerId;
    try {
      return localStorage.getItem('last_chess_player_id') || null;
    } catch {
      return null;
    }
  });

  const {
    error, setError, searchTime, playersInQueue, setPlayersInQueue,
    matchmakingTransport, setMatchmakingTransport,
    matchFound, setMatchFound, startMatchmaking, handleCancelMatchmaking,
    pendingMatchmakingRef, clearMatchmakingTimers
  } = useMatchmaking(user, isLoggedIn, settings);

  const gameSessionRef = useRef({
    gameId: gameId,
    playerId: playerId,
    playerColor: playerColor,
    opponentInfo: opponentInfo,
  });

  const persistGameSession = useCallback((session) => {
    gameSessionRef.current = { ...gameSessionRef.current, ...session };
    saveOnlineSession(gameSessionRef.current);
  }, []);

  const clearGameSession = useCallback(() => {
    const currentId = gameSessionRef.current.gameId;
    gameSessionRef.current = { gameId: null, playerId: null, playerColor: null, opponentInfo: null };
    clearOnlineSession();
    if (currentId) clearOnlineGameState(currentId);
    try {
      localStorage.removeItem('last_chess_player_id');
      localStorage.removeItem('last_chess_color');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) {
      const id = `user_${user.id}`;
      setPlayerId(id);
      try {
        localStorage.setItem('last_chess_player_id', id);
      } catch {
        // ignore
      }
    }
  }, [user]);

  useEffect(() => {
    if (user?.elo) setPlayerElo(user.elo);
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    socketService.connect().catch(err => {
      if (isMounted) console.warn('[OnlinePlay] Socket failed, polling active:', err);
    });
    return () => {
      isMounted = false;
      socketService.disconnect();
      pollingService.disconnect();
    };
  }, []);

  // Redirect /online → /online/:gameId when resuming a saved session
  useEffect(() => {
    if (!routeGameId && savedSession?.gameId && view === 'playing') {
      navigate(`/online/${savedSession.gameId}`, { replace: true });
    }
  }, [routeGameId, savedSession, view, navigate]);

  useEffect(() => {
    if (routeGameId) {
      const code = routeGameId.toUpperCase();
      setGameId(code);
      setView('playing');

      // Hydrate color / playerId from saved session if this is the same game
      const session = loadOnlineSession();
      let resolvedPlayerId = playerId || (user ? `user_${user.id}` : null);
      let resolvedColor = playerColor;

      if (session && session.gameId === code) {
        if (session.playerId) {
          resolvedPlayerId = session.playerId;
          setPlayerId(session.playerId);
        }
        if (session.playerColor) {
          resolvedColor = session.playerColor;
          setPlayerColor(session.playerColor);
        }
        if (session.opponentInfo) setOpponentInfo(session.opponentInfo);
        gameSessionRef.current = { ...gameSessionRef.current, ...session };
      } else {
        try {
          const lastColor = localStorage.getItem('last_chess_color');
          const lastPlayerId = localStorage.getItem('last_chess_player_id');
          if (lastColor && !resolvedColor) {
            resolvedColor = lastColor;
            setPlayerColor(lastColor);
          }
          if (lastPlayerId && !resolvedPlayerId) {
            resolvedPlayerId = lastPlayerId;
            setPlayerId(lastPlayerId);
          }
        } catch {
          // ignore
        }
      }

      // Recover color from server if still unknown (e.g. shared link / lost localStorage)
      // Re-run when auth finishes loading so refreshes do not strand the user on the wrong side.
      if (!resolvedColor || !resolvedPlayerId) {
        const pid = resolvedPlayerId || (user ? `user_${user.id}` : null);
        if (pid) {
          api.getGameByCode(code)
            .then((data) => {
              if (!data || !pid) return;
              let color = resolvedColor;
              if (data.white_player_id === pid) color = 'white';
              else if (data.black_player_id === pid) color = 'black';
              // Also match by numeric user id stored without prefix
              else if (user) {
                const uid = String(user.id);
                if (String(data.white_player_id) === uid || data.white_player_id === `user_${uid}`) color = 'white';
                else if (String(data.black_player_id) === uid || data.black_player_id === `user_${uid}`) color = 'black';
              }
              if (color) {
                setPlayerColor(color);
                setPlayerId(pid);
                persistGameSession({
                  gameId: code,
                  playerId: pid,
                  playerColor: color,
                });
              }
            })
            .catch(() => {});
        }
      } else {
        persistGameSession({
          gameId: code,
          playerId: resolvedPlayerId,
          playerColor: resolvedColor || null,
        });
      }
    } else {
      const codeFromUrl = searchParams.get('code');
      if (codeFromUrl) {
        setJoinCode(codeFromUrl.toUpperCase());
        setGameMode('friendly');
        setView('lobby');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGameId, searchParams, user, isLoggedIn]);

  useEffect(() => {
    const handleMatchFound = (data) => {
      if (view !== 'matchmaking') return;
      clearMatchmakingTimers();
      pendingMatchmakingRef.current = false;
      const { gameId: matchedGameId, yourColor, yourId, players } = data;
      const opponent = yourColor === 'white' ? players.black : players.white;
      setFoundOpponent(opponent);
      setShowMatchFoundAnimation(true);
      playMatchFoundSound(settings);
      setGameId(matchedGameId);
      setPlayerId(yourId);
      setPlayerColor(yourColor);
      setMatchFound(true);
      setOpponentInfo(opponent);
      setTimeout(() => setShowMatchFoundAnimation(false), 2000);
      persistGameSession({
        gameId: matchedGameId,
        playerId: yourId,
        playerColor: yourColor,
        opponentInfo: opponent,
      });
      socketService.joinGame(matchedGameId, yourId);
      setView('playing');
      navigate(`/online/${matchedGameId}`, { replace: true });
    };

    const handleMatchmakingError = (data) => {
      if (view === 'matchmaking') {
        setError(data?.message || 'Matchmaking error occurred.');
        handleCancelMatchmaking();
      }
    };

    socketService.on('match_found', handleMatchFound);
    socketService.on('matchmaking_error', handleMatchmakingError);
    pollingService.on('match_found', handleMatchFound);
    pollingService.on('matchmaking_error', handleMatchmakingError);
    pollingService.on('queue_details', (data) => data?.total !== undefined && setPlayersInQueue(data.total));

    return () => {
      socketService.off('match_found', handleMatchFound);
      socketService.off('matchmaking_error', handleMatchmakingError);
      pollingService.off('match_found', handleMatchFound);
      pollingService.off('matchmaking_error', handleMatchmakingError);
    };
  }, [view, clearMatchmakingTimers, navigate, persistGameSession, setPlayerId, settings, handleCancelMatchmaking, setError, setPlayersInQueue, setMatchFound, pendingMatchmakingRef]);

  const handleSelectMode = useCallback(async (mode) => {
    if (!isLoggedIn) {
      setPendingMode(mode);
      setShowLoginModal(true);
      return;
    }
    if (mode === 'ranked') {
      const started = await startMatchmaking();
      if (started) setView('matchmaking');
    } else {
      setGameMode(mode);
      setView('lobby');
    }
  }, [isLoggedIn, startMatchmaking]);

  const handleCreateGame = useCallback(async () => {
    if (!isLoggedIn || !user) return setError('Sign in required.');
    try {
      const res = await api.createOnlineGame({
        playerId: `user_${user.id}`,
        playerName: user.username,
        playerColor: selectedColor,
        playerElo: user.elo,
      });
      setGameId(res.gameCode);
      const id = `user_${user.id}`;
      setPlayerId(id);
      setPlayerColor(res.playerColor);
      persistGameSession({ gameId: res.gameCode, playerId: id, playerColor: res.playerColor });
      setView('waiting');
      setIsWaiting(true);
    } catch (e) {
      setError('Failed to create game.');
    }
  }, [selectedColor, isLoggedIn, user, setError, persistGameSession]);

  const handleJoinGame = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return setError('Please enter a game code');
    if (!isLoggedIn || !user) return setError('Sign in required.');
    try {
      const res = await api.joinOnlineGame({
        gameCode: code,
        playerId: `user_${user.id}`,
        playerName: user.username,
        playerElo: user.elo,
      });
      setGameId(res.gameCode);
      const id = `user_${user.id}`;
      setPlayerId(id);
      setPlayerColor(res.playerColor);
      persistGameSession({ gameId: res.gameCode, playerId: id, playerColor: res.playerColor });
      setView('playing');
      navigate(`/online/${res.gameCode}`, { replace: true });
    } catch (e) {
      setError('Game not found or full.');
    }
  }, [joinCode, isLoggedIn, user, setError, persistGameSession, navigate]);

  const handleLeaveGame = useCallback(() => {
    if (gameId && playerId) {
      api.leaveOnlineGame({ gameCode: gameId, playerId }).catch(() => {});
      socketService.leaveGame(gameId, playerId);
    }
    setView('mode-select');
    setGameMode(null);
    setGameId(null);
    setOpponentInfo(null);
    clearGameSession();
    navigate('/online');
  }, [gameId, playerId, navigate, clearGameSession]);

  return (
    <div className={`online-play-page ${isGuest ? 'guest' : ''}`}>
      {isGuest && (
        <div className="guest-banner" role="status">
          <div className="guest-banner-content">
            <div className="guest-banner-icon">🔒</div>
            <div className="guest-banner-text"><strong>Guest mode.</strong> Sign in for online games.</div>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>Sign In</button>
          </div>
        </div>
      )}
      {showMatchFoundAnimation && foundOpponent && (
        <div className="match-found-animation active">
          <div className="match-found-content">
            <h2>MATCH FOUND!</h2>
            <div className="opponent-preview">
              <div className="opponent-avatar">{foundOpponent.name.charAt(0).toUpperCase()}</div>
              <div>{foundOpponent.name} (Rating: {foundOpponent.elo})</div>
            </div>
          </div>
        </div>
      )}
      {view === 'mode-select' && (
        <LobbyUI
          isLoggedIn={isLoggedIn} user={user} playerElo={playerElo}
          error={error} handleSelectMode={handleSelectMode} navigate={navigate}
        />
      )}
      {view === 'matchmaking' && (
        <div className="waiting-container">
          <div className="waiting-content">
            <h2>Finding Opponent</h2>
            <p>Searching... {Math.floor(searchTime / 60)}:{(searchTime % 60).toString().padStart(2, '0')}</p>
            <p>Players Online: {playersInQueue}</p>
            <button className="btn btn-ghost" onClick={() => { handleCancelMatchmaking(); setView('mode-select'); }}>Cancel</button>
          </div>
        </div>
      )}
      {view === 'lobby' && (
        <div className="lobby-container">
          <div className="lobby-content">
            <h2>Friendly Game</h2>
            <button className="btn btn-primary" onClick={handleCreateGame}>Create Game</button>
            <div className="join-form">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Game Code" />
              <button className="btn btn-secondary" onClick={handleJoinGame}>Join</button>
            </div>
            <button className="btn btn-ghost" onClick={() => setView('mode-select')}>Back</button>
          </div>
        </div>
      )}
      {view === 'waiting' && (
        <div className="waiting-container">
          <div className="waiting-content">
            <h2>Waiting for Opponent</h2>
            <div className="game-code-box">Code: {gameId}</div>
            <button className="btn btn-ghost" onClick={() => { setView('lobby'); setIsWaiting(false); }}>Cancel</button>
          </div>
        </div>
      )}
      {view === 'playing' && gameId && (
        <OnlineChessGame
          gameId={gameId}
          playerId={playerId}
          playerColor={playerColor}
          opponentInfo={opponentInfo}
          onLeave={handleLeaveGame}
        />
      )}
      {showLoginModal && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            if (pendingMode) {
              handleSelectMode(pendingMode);
            }
          }}
        />
      )}
    </div>
  );
}