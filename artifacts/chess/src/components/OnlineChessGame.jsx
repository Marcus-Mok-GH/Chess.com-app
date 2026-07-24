import "./ChessGame.css";
import haptics from '../utils/haptics';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { normalizeMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import socketService from '../services/socket';
import api from '../services/api';
import { findKingSquare } from './ChessGame/utils';
import { useGameCore } from './OnlineChessGame/hooks/useGameCore';
import GameUI from './OnlineChessGame/subcomponents/GameUI';
import {
  saveOnlineSession,
  clearOnlineSession,
  clearOnlineGameState,
} from '../utils/gamePersistence';

const REACTIONS = ['GOOD', 'CLAP', 'THINK', 'WOW', 'PARTY', 'SWEAT'];

export default function OnlineChessGame({ gameId, playerId, playerColor, opponentInfo, onLeave }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const {
    game, setGame, moveHistory, setMoveHistory, gameStatus, setGameStatus,
    endReason, setEndReason, winner, setWinner, moveError, setMoveError,
    makeMove, colorCode, restoredMeta,
  } = useGameCore(gameId, playerId, playerColor, settings);

  const [chatMessages, setChatMessages] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [opponentStatus, setOpponentStatus] = useState('connected');
  const [whitePlayer, setWhitePlayer] = useState(
    () => restoredMeta?.whitePlayer || { name: 'White', elo: null },
  );
  const [blackPlayer, setBlackPlayer] = useState(
    () => restoredMeta?.blackPlayer || { name: 'Black', elo: null },
  );
  const [eloChange, setEloChange] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const lastVictoryKeyRef = useRef(null);
  const victoryTimeoutRef = useRef(null);
  const hasHydratedFromDb = useRef(false);

  const animationIdRef = useRef(0);
  const boardOrientation = playerColor || 'white';

  // Keep session metadata sticky for refresh recovery
  useEffect(() => {
    if (!gameId || !playerId) return;
    saveOnlineSession({
      gameId,
      playerId,
      playerColor,
      opponentInfo,
    });
  }, [gameId, playerId, playerColor, opponentInfo]);

  // Recover from DB if local snapshot is empty / incomplete
  useEffect(() => {
    if (!gameId || hasHydratedFromDb.current) return;
    let cancelled = false;

    api.getGameByCode(gameId)
      .then((data) => {
        if (cancelled || !data) return;
        const history = normalizeMoveHistory(data.move_history);
        // Prefer server if it has more moves (or local is empty)
        if (history.length >= moveHistory.length) {
          setGame(buildGameFromHistory(history, data.fen));
          setMoveHistory(history);
          if (data.status === 'ended' || data.status === 'completed') {
            setGameStatus('ended');
          } else if (data.status) {
            setGameStatus(data.status === 'playing' || data.status === 'in_progress' ? 'playing' : data.status);
          }
          console.log('[OnlineGame] Recovered state from DB');
        }
        if (data.white_player_name || data.black_player_name) {
          if (data.white_player_name) {
            setWhitePlayer((prev) => ({
              name: data.white_player_name || prev.name,
              elo: data.white_elo ?? prev.elo,
            }));
          }
          if (data.black_player_name) {
            setBlackPlayer((prev) => ({
              name: data.black_player_name || prev.name,
              elo: data.black_elo ?? prev.elo,
            }));
          }
        }
        hasHydratedFromDb.current = true;
      })
      .catch(() => {
        hasHydratedFromDb.current = true;
      });

    return () => {
      cancelled = true;
    };
    // Only run once per gameId mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !playerId) return;

    const ensureJoin = async () => {
      try {
        await socketService.connect();
      } catch {
        // continue; join is no-op if disconnected
      }
      socketService.joinGame(gameId, playerId);
    };
    ensureJoin();

    // Re-join after reconnect so refresh + brief disconnects recover
    const handleConnectionStatus = (status) => {
      if (status?.connected) {
        socketService.joinGame(gameId, playerId);
      }
    };
    socketService.on('connection_status', handleConnectionStatus);

    const handleGameState = (data) => {
      const history = normalizeMoveHistory(data.moveHistory);
      setGame(buildGameFromHistory(history, data.fen));
      setMoveHistory(history);
      const status = data.status === 'ended' || data.status === 'completed' ? 'ended' : (data.status || 'playing');
      setGameStatus(status === 'waiting' ? 'playing' : status);
      if (data.whitePlayer) setWhitePlayer({ name: data.whitePlayer, elo: data.whiteElo });
      if (data.blackPlayer) setBlackPlayer({ name: data.blackPlayer, elo: data.blackElo });
    };

    const handleMoveMade = (data) => {
      const history = normalizeMoveHistory(data.moveHistory);
      if (data.playerId !== playerId) {
        const lastMove = history[history.length - 1];
        if (lastMove) {
          if (lastMove.captured) haptics.capture(); else haptics.move();
        }
      }
      // Always apply authoritative server state (handles re-sync after refresh)
      setGame(buildGameFromHistory(history, data.fen));
      setMoveHistory(history);
    };

    const handleGameEnded = (data) => {
      setGameStatus('ended');
      setEndReason(data.reason);
      setWinner(data.result);
      clearOnlineSession();
    };

    const handleOpponentDisconnected = () => setOpponentStatus('disconnected');
    const handleEloUpdated = (data) => setEloChange(data.change);
    const handleDrawOffered = (data) => {
      if (data.offeredBy !== playerId) setDrawOffered(true);
    };
    const handleMoveError = (data) => setMoveError(data.message);
    const handleChatMessage = (data) => {
      setChatMessages((prev) => [...prev, data]);
    };
    const handlePlayerJoined = () => setOpponentStatus('connected');

    socketService.on('game_state', handleGameState);
    socketService.on('move_made', handleMoveMade);
    socketService.on('game_ended', handleGameEnded);
    socketService.on('opponent_disconnected', handleOpponentDisconnected);
    socketService.on('player_joined', handlePlayerJoined);
    socketService.on('elo_updated', handleEloUpdated);
    socketService.on('draw_offered', handleDrawOffered);
    socketService.on('move_error', handleMoveError);
    socketService.on('chat_message', handleChatMessage);

    return () => {
      socketService.off('connection_status', handleConnectionStatus);
      socketService.off('game_state', handleGameState);
      socketService.off('move_made', handleMoveMade);
      socketService.off('game_ended', handleGameEnded);
      socketService.off('opponent_disconnected', handleOpponentDisconnected);
      socketService.off('player_joined', handlePlayerJoined);
      socketService.off('elo_updated', handleEloUpdated);
      socketService.off('draw_offered', handleDrawOffered);
      socketService.off('move_error', handleMoveError);
      socketService.off('chat_message', handleChatMessage);
      // Do NOT leave the game room on unmount from refresh — only explicit leave
      // should close the seat. Leaving here races with reconnect and can end the game.
    };
  }, [gameId, playerId, setGame, setMoveHistory, setGameStatus, setEndReason, setWinner, setMoveError]);
  // HTTP polling fallback so opponent moves appear without a manual refresh.
  // On Vercel (where VITE_SOCKET_URL is unset) Socket.IO cannot run, so the
  // dedicated server room broadcast never reaches the client. This interval pulls
  // the authoritative game state from the existing /api/games/by-code endpoint
  // every 2s while the game is active and applies new moves through the same
  // setters the socket handlers use.
  //
  // Two correctness rules:
  //   1. Only react when the server has STRICTLY MORE moves than we last applied
  //      (tracked via appliedHistoryLenRef, kept in sync by both the socket
  //      `move_made` handler and the local makeMove path). This avoids a stale
  //      closure over `moveHistory.length` that would otherwise never advance.
  //   2. Skip moves whose ply parity matches the local player's color, so we
  //      never re-apply the local player's own just-submitted move and clobber
  //      the optimistic board state while the server is still echoing it back.
  const appliedHistoryLenRef = useRef(0);
  // Mirrors gameStatus so the polling interval (whose deps are identity-only)
  // can observe transitions to 'ended' and short-circuit without re-subscribing.
  const gameStatusRef = useRef(gameStatus);

  useEffect(() => {
    appliedHistoryLenRef.current = Math.max(appliedHistoryLenRef.current, moveHistory.length);
  }, [moveHistory.length]);

  // Keep gameStatusRef in sync with the live status so the polling interval
  // (which only re-subscribes on game/player identity change) can see status
  // transitions to 'ended' and short-circuit without re-subscribing each tick.
  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    if (!gameId || !playerId) return;

    let cancelled = false;
    let inFlight = false;
    const intervalId = setInterval(async () => {
      if (cancelled || inFlight) return;
      if (gameStatusRef.current === 'ended') return;
      inFlight = true;
      try {
        const data = await api.getGameByCode(gameId);
        if (cancelled || !data) return;

        const serverHistory = normalizeMoveHistory(data.move_history);
        const knownLen = appliedHistoryLenRef.current;
        // Genuinely new opponent move only if the server history grew past
        // what we've already applied.
        const hasNewRemoteMove = serverHistory.length > knownLen;

        // Reconcile terminal status/result INDEPENDENTLY of whether a new
        // remote move exists. The server may flip to 'ended' via a local
        // (optimistic) checkmate echo, a server-side timeout, or an opponent-
        // side decision that didn't grow our move history this tick.
        const serverStatus =
          data.status === 'ended' || data.status === 'completed'
            ? 'ended'
            : data.status || 'playing';
        if (serverStatus === 'ended') {
          setGameStatus('ended');
          if (data.result) setWinner(data.result);
          clearOnlineSession();
        } else if (gameStatusRef.current !== 'ended' && (data.status === 'playing' || data.status === 'in_progress')) {
          setGameStatus('playing');
        }

        if (!hasNewRemoteMove) {
          // No new remote move to apply this tick — terminal handling above
          // (if any) has already run. Bail out before touching the board.
          return;
        }

        // Plies are 0-indexed (move 0 = white's first). White plays even
        // plies, black plays odd plies. The last entry index is history - 1.
        const lastPlyIndex = serverHistory.length - 1;
        const lastIsWhiteMove = lastPlyIndex % 2 === 0;
        const localIsWhite = playerColor === 'white';
        const lastMoveIsLocal = lastIsWhiteMove === localIsWhite;

        // Always advance the ref so we don't reapply the same delta next tick.
        appliedHistoryLenRef.current = serverHistory.length;

        if (lastMoveIsLocal) return; // our own echo — keep optimistic board

        // Opponent moved (strictly more moves on server). Reapply authoritative
        // board state through the same path as the socket `move_made` handler.
        setGame(buildGameFromHistory(serverHistory, data.fen));
        setMoveHistory(serverHistory);

        const lastEntry = serverHistory[serverHistory.length - 1];
        let lastEntryObj = null;
        if (typeof lastEntry === 'object' && lastEntry) lastEntryObj = lastEntry;
        else if (typeof lastEntry === 'string') {
          try { lastEntryObj = JSON.parse(lastEntry); } catch { lastEntryObj = null; }
        }
        if (lastEntryObj && lastEntryObj.captured) haptics.capture(); else haptics.move();
      } catch {
        // Transient network/DB blip — keep polling; a manual refresh would not be
        // safer or better than waiting for the next tick.
      } finally {
        inFlight = false;
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // Identity-only deps; moveHistory parity is read via refs inside poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, playerId, playerColor, setGame, setMoveHistory, setGameStatus, setWinner]);

  useEffect(() => {
    if (opponentInfo) {
      if (playerColor === 'white') setBlackPlayer({ name: opponentInfo.name, elo: opponentInfo.elo });
      else setWhitePlayer({ name: opponentInfo.name, elo: opponentInfo.elo });
    }
  }, [opponentInfo, playerColor]);

  useEffect(() => {
    if (!game) return;

    const isCheckmate = game.isCheckmate();
    const winningColor = isCheckmate ? (game.turn() === 'w' ? 'black' : 'white') : null;
    const didPlayerWin = isCheckmate && winningColor === playerColor;

    if (!didPlayerWin) {
      setShowVictory(false);
      return;
    }

    const victoryKey = `${game.fen()}-${winningColor}`;
    if (lastVictoryKeyRef.current === victoryKey) return;

    lastVictoryKeyRef.current = victoryKey;
    setShowVictory(true);
    if (victoryTimeoutRef.current) clearTimeout(victoryTimeoutRef.current);
    victoryTimeoutRef.current = setTimeout(() => setShowVictory(false), 2200);
  }, [game, playerColor]);

  const triggerAnimation = useCallback((move) => {
    const id = animationIdRef.current++;
    setAnimatingPieces(prev => [...prev, { id, piece: { type: move.piece, color: move.color }, fromSquare: move.from, toSquare: move.to }]);
  }, []);

  const handlePieceDrop = useCallback((from, to) => {
    if (game.turn() !== colorCode || gameStatus !== 'playing') return false;

    const piece = game.get(from);
    if (!piece || piece.color !== colorCode) return false;

    const moved = makeMove({ from, to, promotion: 'q' });
    if (moved) {
      haptics.move();
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
    return moved;
  }, [game, colorCode, gameStatus, makeMove]);

  const canDragPiece = useCallback((pieceType, square) => {
    if (game.turn() !== colorCode || gameStatus !== 'playing') return false;
    const piece = game.get(square);
    return Boolean(piece && piece.color === colorCode && pieceType?.[0] === colorCode);
  }, [game, colorCode, gameStatus]);

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== colorCode || gameStatus !== 'playing') return;
      
      const piece = game.get(square);

      // 1. Selection logic: If clicking our own piece, always select it
      if (piece && piece.color === colorCode) {
        // If clicking same square, deselect
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }
        
        // Otherwise select new piece
        setSelectedSquare(square);
        haptics.select();
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
        return;
      }

      // 2. Move logic: If we have a selection and click a non-own-piece square
      if (selectedSquare) {
        const isLegal = possibleMoves.includes(square);
        
        if (isLegal) {
          handlePieceDrop(selectedSquare, square);
          return;
        }
      }

      // 3. Deselect if clicking anywhere else or invalid move
      setSelectedSquare(null);
      setPossibleMoves([]);
    },
    [game, colorCode, gameStatus, selectedSquare, possibleMoves, handlePieceDrop]
  );

  const customSquareStyles = useMemo(() => {
    const styles = {};
    if (selectedSquare) styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    possibleMoves.forEach(s => {
      const isCapture = game.get(s);
      styles[s] = { 
        background: isCapture 
          ? 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 85%, transparent 85%)' 
          : 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)',
        borderRadius: '50%'
      };
    });
    if (game.inCheck()) {
      const king = findKingSquare(game, game.turn());
      if (king) styles[king] = { backgroundColor: 'rgba(255, 0, 0, 0.5)' };
    }
    return styles;
  }, [selectedSquare, possibleMoves, game]);

  const capturedPieces = useMemo(() => {
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    game.board().forEach(row => row.forEach(p => p && p.type !== 'k' && current[p.color][p.type]++));
    const captured = { w: [], b: [] };
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    ['w', 'b'].forEach(c => ['q', 'r', 'b', 'n', 'p'].forEach(p => {
      for (let i = 0; i < initial[p] - current[c][p]; i++) captured[c].push(p);
    }));
    return captured;
  }, [game]);

  const getStatusMessage = () => {
    if (gameStatus === 'ended') return endReason === 'resignation' ? `${winner} wins by resignation` : winner === 'draw' ? 'Draw' : `${winner} wins`;
    if (game.inCheck()) return 'Check!';
    return game.turn() === colorCode ? 'Your turn' : "Opponent's turn";
  };

  return (
    <div className="online-chess-game">
      <GameUI
        topPlayer={boardOrientation === 'white' ? { ...blackPlayer, color: 'b' } : { ...whitePlayer, color: 'w' }}
        bottomPlayer={boardOrientation === 'white' ? { ...whitePlayer, color: 'w' } : { ...blackPlayer, color: 'b' }}
        game={game} onSquareClick={onSquareClick} onPieceDrop={handlePieceDrop}
        canDragPiece={canDragPiece}
        boardOrientation={boardOrientation} customSquareStyles={customSquareStyles}
        settings={settings} animatingPieces={animatingPieces}
        removeAnimation={(id) => setAnimatingPieces(prev => prev.filter(a => a.id !== id))}
        showVictory={showVictory} gameId={gameId} opponentStatus={opponentStatus}
        eloChange={eloChange} moveError={moveError} getStatusMessage={getStatusMessage}
        drawOffered={drawOffered} handleRespondDraw={(acc) => socketService.respondDraw(gameId, playerId, acc)}
        REACTIONS={REACTIONS} handleSendReaction={(r) => socketService.sendMessage(gameId, playerId, r)}
        chatMessages={chatMessages} handleSendMessage={(m) => socketService.sendMessage(gameId, playerId, m)} playerId={playerId}
        moveHistory={moveHistory} gameStatus={gameStatus}
        handleOfferDraw={() => socketService.offerDraw(gameId, playerId)}
        handleResign={() => {
          socketService.resignGame(gameId, playerId);
          clearOnlineSession();
          if (gameId) clearOnlineGameState(gameId);
        }}
        navigate={navigate} canReview={gameStatus === 'ended'} onLeave={() => {
          clearOnlineSession();
          if (gameId) clearOnlineGameState(gameId);
          onLeave?.();
        }}
        capturedPieces={capturedPieces}
      />
    </div>
  );
}
