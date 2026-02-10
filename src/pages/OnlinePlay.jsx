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
import './OnlinePlay.css';

export default function OnlinePlay() {
  const [searchParams] = useSearchParams();
  const { gameId: routeGameId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, isLoggedIn } = useUser();
  const isGuest = !isLoggedIn;

  const [view, setView] = useState('mode-select');
  const [gameMode, setGameMode] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [selectedColor, setSelectedColor] = useState('white');
  const [error, setError] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playerElo, setPlayerElo] = useState(() => user?.elo || 1200);
  const [searchTime, setSearchTime] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [matchFound, setMatchFound] = useState(false);
  const [showMatchFoundAnimation, setShowMatchFoundAnimation] = useState(false);
  const [foundOpponent, setFoundOpponent] = useState(null);
  const [opponentInfo, setOpponentInfo] = useState(null);
  const [playersInQueue, setPlayersInQueue] = useState('--');
  
  const searchTimeInterval = useRef(null);
  const matchmakingSessionId = useRef(
    typeof crypto !== 'undefined'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const gameSessionRef = useRef({ gameId: null, playerId: null, playerColor: null, opponentInfo: null });

  const persistGameSession = useCallback((session) => {
    const nextSession = {
      ...gameSessionRef.current,
      ...session,
    };
    gameSessionRef.current = nextSession;
  }, []);

  const clearGameSession = useCallback(() => {
    gameSessionRef.current = { gameId: null, playerId: null, playerColor: null, opponentInfo: null };
  }, []);
  const heartbeatInterval = useRef(null);
  const pendingMatchmakingRef = useRef(false);

  // Connect to socket on mount (optional, polling will be used if not available)
  useEffect(() => {
    let isMounted = true;
    
    console.log('[OnlinePlay] Initializing services...');
    
    const connectSocket = async () => {
      try {
        await socketService.connect();
        if (isMounted) {
          console.log('[OnlinePlay] Socket connected successfully');
        }
      } catch (error) {
        if (isMounted) {
          console.warn('[OnlinePlay] Socket connection failed, polling will be used:', error);
        }
      }
    };
    
    connectSocket();

    return () => {
      isMounted = false;
      console.log('[OnlinePlay] Cleaning up...');
      socketService.disconnect();
      pollingService.disconnect();
    };
  }, []);

  // Handle URL game code or direct game route
  useEffect(() => {
    if (routeGameId) {
      const normalizedGameId = routeGameId.toUpperCase();
      setGameId(normalizedGameId);

      setPlayerId(null);
      setPlayerColor(null);
      setOpponentInfo(null);

      setView('playing');
      return;
    }

    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl) {
      setJoinCode(codeFromUrl.toUpperCase());
      setGameMode('friendly');
      setView('lobby');
    }
  }, [routeGameId, searchParams]);

  const startMatchmaking = useCallback(async () => {
    // Check if Socket.IO is configured and connected
    const usePolling = !socketService.socket?.io?.uri || !socketService.socket?.io?.opts?.path;
    
    if (usePolling) {
      console.log('[OnlinePlay] Using polling-based matchmaking (serverless mode)');
      setGameMode('ranked');
      setError('');
      setView('matchmaking');
      setSearchTime(0);
      setMatchFound(false);
      
      if (!isLoggedIn || !user) {
        setError('Sign in required for matchmaking.');
        setView('mode-select');
        return;
      }

      const currentElo = user.elo;
      const currentName = user.username;
      const playerId = `user_${user.id}_${matchmakingSessionId.current}`;
      
      setPlayerElo(currentElo);
      setPlayerId(playerId);
      
      console.log('[OnlinePlay] Starting polling matchmaking:', {
        playerId,
        playerName: currentName,
        elo: currentElo
      });
      
      // Join matchmaking queue via polling
      const joined = await pollingService.joinMatchmaking(playerId, currentName, currentElo, true);
      if (!joined) {
        setError('Failed to join matchmaking. Please try again.');
        setView('mode-select');
        return;
      }

      pendingMatchmakingRef.current = true;
      
      // Start search timer
      searchTimeInterval.current = setInterval(() => {
        setSearchTime(prev => prev + 1);
      }, 1000);
      
      // Update queue details every 5 seconds
      const queueUpdateInterval = setInterval(() => {
        pollingService.getQueueDetails();
      }, 5000);
      
      return () => {
        clearInterval(searchTimeInterval.current);
        clearInterval(queueUpdateInterval);
      };
    }

    // Socket may still be connecting; queue the request instead of erroring.
    if (!socketService.isConnected) {
      console.warn('[OnlinePlay] Socket not connected. Deferring matchmaking until connected.');
      pendingMatchmakingRef.current = true;
      setGameMode('ranked');
      setError('Connecting to server. Matchmaking will start automatically...');
      setView('matchmaking');
      setSearchTime(0);
      setMatchFound(false);
      return;
    }

    setGameMode('ranked');
    setError('');
    setView('matchmaking');
    setSearchTime(0);
    setMatchFound(false);
    
    if (!isLoggedIn || !user) {
      setError('Sign in required for matchmaking.');
      setView('mode-select');
      return;
    }

    // Get player info from user context if logged in.
    const currentElo = user.elo;
    const currentName = user.username;
    const playerId = `user_${user.id}_${matchmakingSessionId.current}`;
    
    setPlayerElo(currentElo);
    setPlayerId(playerId);
    
    console.log('[OnlinePlay] Starting Socket.IO matchmaking:', {
      playerId,
      playerName: currentName,
      elo: currentElo
    });
    
    // Join matchmaking queue via socket
    const joined = socketService.joinMatchmaking(playerId, currentName, currentElo, true);
    if (!joined) {
      setError('Failed to join matchmaking. Please try again.');
      setView('mode-select');
      return;
    }

    pendingMatchmakingRef.current = true;
    
    // Start search timer
    searchTimeInterval.current = setInterval(() => {
      setSearchTime(prev => prev + 1);
    }, 1000);
    
    // Send heartbeat every 20 seconds to keep queue entry alive
    heartbeatInterval.current = setInterval(() => {
      socketService.sendMatchmakingHeartbeat(playerId);
    }, 20000);
    
    // Update queue details every 5 seconds
    const queueUpdateInterval = setInterval(() => {
      socketService.getQueueDetails();
    }, 5000);
    
    return () => {
      clearInterval(searchTimeInterval.current);
      clearInterval(heartbeatInterval.current);
      clearInterval(queueUpdateInterval);
    };
  }, [isLoggedIn, user]);

  const clearMatchmakingTimers = useCallback(() => {
    if (searchTimeInterval.current) {
      clearInterval(searchTimeInterval.current);
      searchTimeInterval.current = null;
    }
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  const handleCancelMatchmaking = useCallback(async () => {
    clearMatchmakingTimers();

    pendingMatchmakingRef.current = false;
    
    // Leave matchmaking queue via both services
    if (playerId) {
      socketService.leaveMatchmaking(playerId);
      await pollingService.leaveMatchmaking(playerId);
    }
    
    setSearchTime(0);
    setError('');
    setView('mode-select');
    setGameMode(null);
    setMatchFound(false);
    setPlayersInQueue('--');
  }, [clearMatchmakingTimers, playerId]);

  // Set up event listeners for both Socket.IO and polling
  useEffect(() => {
    const handleMatchFound = (data) => {
      console.log('[OnlinePlay] Match found:', data);

      if (view !== 'matchmaking') {
        console.warn('[OnlinePlay] Ignoring match_found; not in matchmaking view.');
        return;
      }

      // Stop matchmaking timers
      clearMatchmakingTimers();
      pendingMatchmakingRef.current = false;

      const { gameId: matchedGameId, yourColor, yourId, players } = data;

      if (!matchedGameId || !yourId || !players?.white || !players?.black) {
        console.error('[OnlinePlay] Invalid match data received:', data);
        setError('Matchmaking failed. Please try again.');
        setView('mode-select');
        return;
      }
      
      // Show match found animation
      const opponent = yourColor === 'white' ? players.black : players.white;
      setFoundOpponent(opponent);
      setShowMatchFoundAnimation(true);
      
      playMatchFoundSound(settings);
      
      // Hide animation after 2 seconds and proceed
      setTimeout(() => {
        setShowMatchFoundAnimation(false);
        setGameId(matchedGameId);
        setPlayerId(yourId);
        setPlayerColor(yourColor);
        setMatchFound(true);
        setOpponentInfo(opponent);
      }, 2000);
      
      persistGameSession({
        gameId: matchedGameId,
        playerId: yourId,
        playerColor: yourColor,
        opponentInfo: opponent,
      });

      // Join the game room via Socket.IO if available
      if (socketService.isConnected) {
        socketService.joinGame(matchedGameId, yourId);
      }
      
      // Transition to playing
      setView('playing');
      setIsWaiting(false);
      navigate(`/game/${matchedGameId}`, { replace: true });
      
      console.log('[OnlinePlay] Match setup complete:', {
        gameId: matchedGameId,
        yourColor,
        yourId,
        opponent
      });
    };

    const handleMatchmakingError = (data) => {
      console.error('[OnlinePlay] Matchmaking error:', data);
      if (view === 'matchmaking') {
        setError(data?.message || 'Matchmaking error occurred.');
        handleCancelMatchmaking();
      }
    };

    const handleQueueDetails = (data) => {
      console.log('[OnlinePlay] Queue details:', data);
      if (data?.total !== undefined) {
        setPlayersInQueue(data.total);
      }
    };

    // Subscribe to socket events
    socketService.on('match_found', handleMatchFound);
    socketService.on('matchmaking_status', (data) => {
      console.log('[OnlinePlay] Matchmaking status:', data);
      if (!data?.inQueue && view === 'matchmaking') {
        setError(data?.message || 'Failed to join matchmaking queue.');
        handleCancelMatchmaking();
      }
    });
    socketService.on('matchmaking_error', handleMatchmakingError);
    socketService.on('connection_status', (data) => {
      console.log('[OnlinePlay] Connection status:', data);
      if (data.connected && pendingMatchmakingRef.current) {
        pendingMatchmakingRef.current = false;
        startMatchmaking();
        return;
      }
      if (!data.connected && view === 'matchmaking') {
        clearMatchmakingTimers();
        setError('Connection lost. Reconnecting...');
        pendingMatchmakingRef.current = true;
      }
    });
    socketService.on('connection_error', (data) => {
      console.error('[OnlinePlay] Connection error:', data);
      if (view === 'matchmaking') {
        setError(data?.error || 'Unable to connect to server. Retrying...');
        pendingMatchmakingRef.current = true;
      }
    });
    socketService.on('game_error', (data) => {
      console.error('[OnlinePlay] Game error:', data);
      setError(data?.message || 'Game error occurred');
    });
    socketService.on('queue_details', handleQueueDetails);

    // Subscribe to polling events
    pollingService.on('match_found', handleMatchFound);
    pollingService.on('matchmaking_error', handleMatchmakingError);
    pollingService.on('queue_details', handleQueueDetails);

    return () => {
      // Unsubscribe from socket events
      socketService.off('match_found', handleMatchFound);
      socketService.off('matchmaking_status');
      socketService.off('matchmaking_error', handleMatchmakingError);
      socketService.off('connection_status');
      socketService.off('connection_error');
      socketService.off('game_error');
      socketService.off('queue_details');
      
      // Unsubscribe from polling events
      pollingService.off('match_found', handleMatchFound);
      pollingService.off('matchmaking_error', handleMatchmakingError);
      pollingService.off('queue_details', handleQueueDetails);
    };
  }, [startMatchmaking, view, handleCancelMatchmaking]);

  // Cleanup matchmaking queue on unmount or page unload.
  useEffect(() => {
    const handleUnload = () => {
      if (playerId) {
        // Use sync leave for polling to ensure request completes before page closes
        pollingService.leaveMatchmakingSync(playerId);
        // Socket leave is fire-and-forget, no need to await
        socketService.leaveMatchmaking(playerId);
      }
    };

    const handleVisibilityChange = () => {
      // Clean up when user navigates away or tab becomes hidden
      if (document.visibilityState === 'hidden' && playerId) {
        console.log('[OnlinePlay] Page hidden, cleaning up matchmaking...');
        pollingService.leaveMatchmakingSync(playerId);
        socketService.leaveMatchmaking(playerId);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      handleUnload();
    };
  }, [playerId]);

  const handleSelectMode = useCallback((mode) => {
    setError('');
    // Encourage login for all online modes
    if (!isLoggedIn) {
      setPendingMode(mode);
      setShowLoginModal(true);
      return;
    }
    if (mode === 'ranked') {
      startMatchmaking();
    } else {
      setGameMode(mode);
      setView('lobby');
    }
  }, [isLoggedIn, startMatchmaking]);

  const handleLoginSuccess = useCallback(() => {
    setShowLoginModal(false);
    // Continue to selected mode after login
    if (pendingMode === 'ranked') {
      startMatchmaking();
    } else if (pendingMode === 'friendly') {
      setGameMode('friendly');
      setView('lobby');
    }
    setPendingMode(null);
  }, [pendingMode, startMatchmaking]);

  const handleCreateGame = useCallback(async () => {
    setError('');
    if (!isLoggedIn || !user) {
      setError('Sign in required to create a game.');
      return;
    }
    const playerName = user.username;
    const playerId = `user_${user.id}`;

    try {
      const result = await api.createOnlineGame({
        gameCode: null,
        playerId,
        playerName,
        playerColor: selectedColor,
        playerElo: user.elo,
      });

      setGameId(result.gameCode);
      setPlayerId(playerId);
      setPlayerColor(result.playerColor);
      setView('waiting');
      setIsWaiting(true);
    } catch (error) {
      console.error('[OnlinePlay] Failed to create online game:', error);
      setError('Failed to create game. Please try again.');
    }
  }, [selectedColor, isLoggedIn, user]);

  const handleJoinGame = useCallback(async () => {
    setError('');
    const code = joinCode.trim().toUpperCase();

    if (!code) {
      setError('Please enter a game code');
      return;
    }

    if (!isLoggedIn || !user) {
      setError('Sign in required to join a game.');
      return;
    }
    const playerName = user.username;
    const playerId = `user_${user.id}`;

    try {
      const result = await api.joinOnlineGame({
        gameCode: code,
        playerId,
        playerName,
        playerElo: user.elo,
      });

      setGameId(result.gameCode);
      setPlayerId(playerId);
      setPlayerColor(result.playerColor);
      setView('playing');
    } catch (error) {
      console.error('[OnlinePlay] Failed to join online game:', error);
      setError('Game not found or already started.');
    }
  }, [joinCode, isLoggedIn, user]);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/online?code=${gameId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [gameId]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(gameId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [gameId]);

  const handleLeaveGame = useCallback(() => {
    if (gameId && playerId) {
      api.leaveOnlineGame({ gameCode: gameId, playerId }).catch((error) => {
        console.error('[OnlinePlay] Failed to leave online game:', error);
      });
      socketService.leaveGame(gameId, playerId);
    }
    if (gameMode === 'ranked' && playerId) {
      socketService.leaveMatchmaking(playerId);
    }
    setView('mode-select');
    setGameMode(null);
    setGameId(null);
    setPlayerId(null);
    setPlayerColor(null);
    setIsWaiting(false);
    setError('');
    setMatchFound(false);
    setPlayersInQueue('--');
    setOpponentInfo(null);
    setPlayerElo(user?.elo || 1200);
    clearGameSession();
    navigate('/online');
  }, [gameId, playerId, gameMode, navigate]);

  const handleCancelWaiting = useCallback(() => {
    if (gameId && playerId) {
      api.leaveOnlineGame({ gameCode: gameId, playerId }).catch((error) => {
        console.error('[OnlinePlay] Failed to cancel online game:', error);
      });
    }
    if (gameMode === 'ranked') {
      setView('mode-select');
      setGameMode(null);
    } else {
      setView('lobby');
    }
    setGameId(null);
    setPlayerId(null);
    setPlayerColor(null);
    setIsWaiting(false);
    clearGameSession();
    navigate('/online');
  }, [gameId, playerId, gameMode, navigate]);

  const handleBackToModeSelect = useCallback(() => {
    setView('mode-select');
    setGameMode(null);
    setError('');
  }, []);

  return (
    <div className={`online-play-page ${isGuest ? 'guest' : ''}`}>
      {isGuest && (
        <div className="guest-banner" role="status">
          <div className="guest-banner-content">
            <div className="guest-banner-icon">🔒</div>
            <div className="guest-banner-text">
              <strong>Guest mode.</strong> Sign in to create or join online games.
            </div>
            <button className="btn btn-primary guest-banner-action" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>
        </div>
      )}
      {/* Match Found Animation */}
      {showMatchFoundAnimation && foundOpponent && (
        <div className={`match-found-animation ${showMatchFoundAnimation ? 'active' : ''}`}>
          <div className="match-found-content">
            <h2 className="match-found-title">MATCH FOUND!</h2>
            <p className="match-found-subtitle">Get ready to play!</p>
            
            <div className="opponent-preview">
              <div className="opponent-avatar">
                {foundOpponent.name.charAt(0).toUpperCase()}
              </div>
              <div className="opponent-info">
                <div className="opponent-name">{foundOpponent.name}</div>
                <div className="opponent-rating">Rating: {foundOpponent.elo}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {view === 'mode-select' && (
        <div className="lobby-container">
          <div className="lobby-content mode-select-content">
            <div className="elo-display">
              <span className="elo-label">{isLoggedIn ? user.username : 'Your Rating'}</span>
              <span className="elo-value">{isLoggedIn ? user.elo : playerElo}</span>
            </div>

            <h2 className="mode-title">Choose Game Mode</h2>

            {/* Always show connection errors prominently */}
            {error && error.toLowerCase().includes('unable to connect') && (
              <div className="error-message error-message-important">
                <div className="error-icon">⚠️</div>
                <div className="error-text">{error}</div>
              </div>
            )}
            {!error || !error.toLowerCase().includes('unable to connect') && (
              error && <div className="error-message">{error}</div>
            )}

            <div className="mode-options">
              <button
                className="mode-option ranked"
                onClick={() => handleSelectMode('ranked')}
              >
                <div className="mode-icon">⚔️</div>
                <div className="mode-info">
                  <h3>Ranked</h3>
                  <p>Competitive matchmaking based on ELO rating. Win to climb the ladder!</p>
                  {!isLoggedIn && <span className="login-required">Sign in required</span>}
                </div>
              </button>
              
              <button
                className="mode-option friendly"
                onClick={() => handleSelectMode('friendly')}
              >
                <div className="mode-icon">🤝</div>
                <div className="mode-info">
                  <h3>Friendly</h3>
                  <p>Casual games with friends. Create a game or join with a code.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'matchmaking' && (
        <div className="waiting-container">
          <div className="waiting-content">
            <div className="matchmaking-animation">
              <div className="search-radius-indicator">
                <div className="radius-circle"></div>
                <div className="radius-text">Searching...</div>
              </div>
              
              <div className="chess-piece-animation">
                <div className="piece-container">
                  <img src="/custom-pieces/wN.svg" alt="Knight" className="searching-piece" />
                  <img src="/custom-pieces/bN.svg" alt="Knight" className="searching-piece mirrored" />
                </div>
              </div>
              
              <div className="search-grid-enhanced">
                <span className="grid-cell cell-1"></span>
                <span className="grid-cell cell-2"></span>
                <span className="grid-cell cell-3"></span>
                <span className="grid-cell cell-4"></span>
                <span className="grid-cell cell-5"></span>
                <span className="grid-cell cell-6"></span>
                <span className="grid-cell cell-7"></span>
                <span className="grid-cell cell-8"></span>
              </div>
              
              <div className="signal-bars-enhanced">
                <span className="bar bar-1"></span>
                <span className="bar bar-2"></span>
                <span className="bar bar-3"></span>
                <span className="bar bar-4"></span>
                <span className="bar bar-5"></span>
              </div>
            </div>

            <h2 className="matchmaking-title">Finding Opponent</h2>
            <p className="waiting-desc">Searching for a player near your rating...</p>
            {error && <p className="waiting-desc error-message">{error}</p>}
            {pendingMatchmakingRef.current && error && (
              <p className="waiting-desc retrying-status">Retrying matchmaking...</p>
            )}

            <div className="matchmaking-info-enhanced">
              <div className="search-stats">
                <div className="stat">
                  <span className="stat-label">Your Rating</span>
                  <span className="stat-value">{playerElo}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Search Time</span>
                  <span className="stat-value">{Math.floor(searchTime / 60)}:{(searchTime % 60).toString().padStart(2, '0')}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Players Online</span>
                  <span className="stat-value players-online">{playersInQueue}</span>
                </div>
              </div>
              {searchTime >= 10 && (
                <p className="expanded-search">Expanding search range...</p>
              )}
            </div>

            <button className="btn btn-ghost" onClick={handleCancelMatchmaking}>
              ← Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'lobby' && (
        <div className="lobby-container">
          <div className="lobby-content">
            <div className="lobby-section">
              <h2>Create a Game</h2>
              <p className="section-desc">Start a new game and invite a friend to play</p>

              <div className="color-selector">
                <span className="selector-label">Play as:</span>
                <div className="color-options">
                  <button
                    className={`color-option ${selectedColor === 'white' ? 'selected' : ''}`}
                    onClick={() => setSelectedColor('white')}
                  >
                    <img src="/custom-pieces/wK.svg" alt="" className="piece-icon" />
                    <span>White</span>
                  </button>
                  <button
                    className={`color-option ${selectedColor === 'black' ? 'selected' : ''}`}
                    onClick={() => setSelectedColor('black')}
                  >
                    <img src="/custom-pieces/bK.svg" alt="" className="piece-icon" />
                    <span>Black</span>
                  </button>
                </div>
              </div>

              <button className="btn btn-primary btn-large" onClick={handleCreateGame}>
                🎮 Create Game
              </button>
            </div>

            <div className="lobby-divider">
              <span>OR</span>
            </div>

            <div className="lobby-section">
              <h2>Join a Game</h2>
              <p className="section-desc">Enter a game code to join your friend's game</p>

              <div className="join-form">
                <input
                  type="text"
                  className="join-input"
                  placeholder="Enter game code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <button className="btn btn-secondary btn-large" onClick={handleJoinGame}>
                  🚀 Join Game
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>
            
            <button className="btn btn-ghost back-btn" onClick={handleBackToModeSelect}>
              ← Back to Mode Selection
            </button>
          </div>
        </div>
      )}

      {view === 'waiting' && (
        <div className="waiting-container">
          <div className="waiting-content">
            <div className="waiting-animation">
              <div className="search-grid">
                <span className="grid-cell cell-1"></span>
                <span className="grid-cell cell-2"></span>
                <span className="grid-cell cell-3"></span>
                <span className="grid-cell cell-4"></span>
              </div>
              <div className="signal-bars">
                <span className="bar bar-1"></span>
                <span className="bar bar-2"></span>
                <span className="bar bar-3"></span>
                <span className="bar bar-4"></span>
              </div>
              <div className="waiting-icon">
                <img src="/custom-pieces/bN.svg" alt="" />
              </div>
            </div>

            <h2>Waiting for Opponent</h2>
            <p className="waiting-desc">Share this code with your friend to start playing</p>

            <div className="game-code-box">
              <span className="code-label">Game Code</span>
              <span className="code-value">{gameId}</span>
              <button className="copy-btn" onClick={handleCopyCode}>
                {copied ? '✓ Copied!' : '📋 Copy Code'}
              </button>
            </div>

            <div className="share-options">
              <button className="btn btn-secondary" onClick={handleCopyLink}>
                🔗 Copy Invite Link
              </button>
            </div>

            <div className="player-info-waiting">
              <span>You will play as: </span>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <img src={playerColor === 'white' ? '/custom-pieces/wK.svg' : '/custom-pieces/bK.svg'} alt="" style={{ width: 20, height: 20 }} />
                {playerColor === 'white' ? 'White' : 'Black'}
              </strong>
            </div>

            <button className="btn btn-ghost" onClick={handleCancelWaiting}>
              ← Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'playing' && (
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
          mode={pendingMode}
          onClose={() => {
            setShowLoginModal(false);
            setPendingMode(null);
          }}
          onSuccess={handleLoginSuccess}
          onContinueAsGuest={() => {
            if (pendingMode === 'friendly') {
              setGameMode('friendly');
              setView('lobby');
            }
            setPendingMode(null);
          }}
        />
      )}
    </div>
  );
}
