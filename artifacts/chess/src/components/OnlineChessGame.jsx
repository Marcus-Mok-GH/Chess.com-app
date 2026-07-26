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
    makeMove, colorCode, moveInFlightRef, restoredMeta,
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

  useEffect(() => {
    if (!gameId || !playerId) return;
    saveOnlineSession({
      gameId,
      playerId,
      playerColor,
      opponentInfo,
    });
  }, [gameId, playerId, playerColor, opponentInfo]);

  useEffect(() => {
    if (!gameId || hasHydratedFromDb.current) return;
    let cancelled = false;

    api.getGameByCode(gameId)
      .then((data) => {
        if (cancelled || !data) return;
        const history = normalizeMoveHistory(data.move_history);
        if (history.length >= moveHistory.length) {
          setGame(buildGameFromHistory(history, data.fen));
          setMoveHistory(history);
          if (data.status === 'ended' || data.status === 'completed') {
            setGameStatus('ended');
          } else if (data.status) {
            setGameStatus(data.status === 'playing' || data.status === 'in_progress' ? 'playing' : data.status);
          }
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
      .catch(() => { hasHydratedFromDb.current = true; });

    return () => { cancelled = true; };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !playerId) return;

    const ensureJoin = async () => {
      try { await socketService.connect(); } catch {}
      socketService.joinGame(gameId, playerId);
    };
    ensureJoin();

    const handleConnectionStatus = (status) => {
      if (status?.connected) socketService.joinGame(gameId, playerId);
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
        setDrawOffered(false);
        const lastMove = history[history.length - 1];
        if (lastMove) {
          if (lastMove.captured) haptics.capture(); else haptics.move();
        }
      }
      setGame(buildGameFromHistory(history, data.fen));
      setMoveHistory(history);
    };

    const handleGameEnded = (data) => {
      setGameStatus('ended');
      setEndReason(data.reason);
      setWinner(data.result);
      setDrawOffered(false);
      clearOnlineSession();
    };

    const handleOpponentDisconnected = () => setOpponentStatus('disconnected');
    const handleEloUpdated = (data) => setEloChange(data.change);
    const handleDrawOffered = (data) => {
      if (data.offeredBy !== playerId) setDrawOffered(true);
    };
    const handleChatMessage = (data) => setChatMessages((prev) => [...prev, data]);
    const handlePlayerJoined = () => setOpponentStatus('connected');

    socketService.on('game_state', handleGameState);
    socketService.on('move_made', handleMoveMade);
    socketService.on('game_ended', handleGameEnded);
    socketService.on('opponent_disconnected', handleOpponentDisconnected);
    socketService.on('player_joined', handlePlayerJoined);
    socketService.on('elo_updated', handleEloUpdated);
    socketService.on('draw_offered', handleDrawOffered);
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
      socketService.off('chat_message', handleChatMessage);
    };
  }, [gameId, playerId, setGame, setMoveHistory, setGameStatus, setEndReason, setWinner, setMoveError]);

  // HTTP polling — primary source of truth for opponent moves.
  // Local player's own moves are confirmed via the POST response, but opponent
  // moves arrive only through this poll.  The interval avoids overlapping polls
  // via the inFlight guard and stops when the game ends.
  const appliedMoveCountRef = useRef(moveHistory.length);
  const gameStatusRef = useRef(gameStatus);

  useEffect(() => {
    appliedMoveCountRef.current = Math.max(appliedMoveCountRef.current, moveHistory.length);
  }, [moveHistory.length]);

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
        const knownCount = appliedMoveCountRef.current;
        const hasNewMoves = serverHistory.length > knownCount;

        const serverStatus =
          data.status === 'ended' || data.status === 'completed'
            ? 'ended'
            : data.status || 'playing';
        if (serverStatus === 'ended') {
          setGameStatus('ended');
          setDrawOffered(false);
          if (data.result) setWinner(data.result);
          clearOnlineSession();
        } else if (gameStatusRef.current !== 'ended' && (data.status === 'playing' || data.status === 'in_progress')) {
          setGameStatus('playing');
        }

        if (!hasNewMoves) return;

        appliedMoveCountRef.current = serverHistory.length;

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
        // Transient network blip — keep polling
      } finally {
        inFlight = false;
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
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
    if (!didPlayerWin) { setShowVictory(false); return; }
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
    if (moveInFlightRef.current) return false;
    if (game.turn() !== colorCode || gameStatus !== 'playing') return false;
    const piece = game.get(from);
    if (!piece || piece.color !== colorCode) return false;
    const moved = makeMove({ from, to, promotion: 'q' });
    if (moved) {
      haptics.move();
      setSelectedSquare(null);
      setPossibleMoves([]);
      setDrawOffered(false);
    }
    return moved;
  }, [game, colorCode, gameStatus, makeMove, moveInFlightRef]);

  const canDragPiece = useCallback((pieceType, square) => {
    if (game.turn() !== colorCode || gameStatus !== 'playing') return false;
    const piece = game.get(square);
    return Boolean(piece && piece.color === colorCode && pieceType?.[0] === colorCode);
  }, [game, colorCode, gameStatus]);

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== colorCode || gameStatus !== 'playing') return;
      const piece = game.get(square);
      if (piece && piece.color === colorCode) {
        if (square === selectedSquare) { setSelectedSquare(null); setPossibleMoves([]); return; }
        setSelectedSquare(square);
        haptics.select();
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
        return;
      }
      if (selectedSquare) {
        const isLegal = possibleMoves.includes(square);
        if (isLegal) { handlePieceDrop(selectedSquare, square); return; }
      }
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
        drawOffered={drawOffered}         handleRespondDraw={(acc) => { setDrawOffered(false); socketService.respondDraw(gameId, playerId, acc); }}
        REACTIONS={REACTIONS} handleSendReaction={(r) => socketService.sendMessage(gameId, playerId, r)}
        chatMessages={chatMessages} handleSendMessage={(m) => socketService.sendMessage(gameId, playerId, m)} playerId={playerId}
        moveHistory={moveHistory} gameStatus={gameStatus}
        handleOfferDraw={() => socketService.offerDraw(gameId, playerId)}
        handleResign={() => {
          setDrawOffered(false);
          socketService.resignGame(gameId, playerId);
          clearOnlineSession();
          if (gameId) clearOnlineGameState(gameId);
        }}
        navigate={navigate} canReview={gameStatus === 'ended'} onLeave={() => {
          setDrawOffered(false);
          clearOnlineSession();
          if (gameId) clearOnlineGameState(gameId);
          onLeave?.();
        }}
        capturedPieces={capturedPieces}
      />
    </div>
  );
}
