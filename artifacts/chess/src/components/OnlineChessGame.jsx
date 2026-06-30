import haptics from '../utils/haptics';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { normalizeMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import socketService from '../services/socket';
import { findKingSquare } from './ChessGame/utils';
import { useGameCore } from './OnlineChessGame/hooks/useGameCore';
import GameUI from './OnlineChessGame/subcomponents/GameUI';

const REACTIONS = ['👍', '👏', '🤔', '😮', '🎉', '😅'];

export default function OnlineChessGame({ gameId, playerId, playerColor, opponentInfo, onLeave }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const {
    game, setGame, moveHistory, setMoveHistory, gameStatus, setGameStatus,
    endReason, setEndReason, winner, setWinner, moveError, setMoveError,
    makeMove, colorCode
  } = useGameCore(gameId, playerId, playerColor, settings);

  const [chatMessages, setChatMessages] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [opponentStatus, setOpponentStatus] = useState('connected');
  const [whitePlayer, setWhitePlayer] = useState({ name: 'White', elo: null });
  const [blackPlayer, setBlackPlayer] = useState({ name: 'Black', elo: null });
  const [eloChange, setEloChange] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const lastVictoryKeyRef = useRef(null);
  const victoryTimeoutRef = useRef(null);

  const animationIdRef = useRef(0);
  const boardOrientation = playerColor;

  useEffect(() => {
    if (!gameId || !playerId) return;
    socketService.joinGame(gameId, playerId);

    socketService.on('game_state', (data) => {
      const history = normalizeMoveHistory(data.moveHistory);
      setGame(buildGameFromHistory(history, data.fen));
      setMoveHistory(history);
      setGameStatus(data.status);
      if (data.whitePlayer) setWhitePlayer({ name: data.whitePlayer, elo: data.whiteElo });
      if (data.blackPlayer) setBlackPlayer({ name: data.blackPlayer, elo: data.blackElo });
    });

    socketService.on('move_made', (data) => {
      if (data.playerId !== playerId) {
        const history = normalizeMoveHistory(data.moveHistory);
        const lastMove = history[history.length - 1];
        if (lastMove) {
          if (lastMove.captured) haptics.capture(); else haptics.move();
        }
        setGame(buildGameFromHistory(history, data.fen));
        setMoveHistory(history);
      }
    });

    socketService.on('game_ended', (data) => {
      setGameStatus('ended');
      setEndReason(data.reason);
      setWinner(data.result);
    });

    socketService.on('opponent_disconnected', () => setOpponentStatus('disconnected'));
    socketService.on('elo_updated', (data) => setEloChange(data.change));
    socketService.on('draw_offered', (data) => data.offeredBy !== playerId && setDrawOffered(true));
    socketService.on('move_error', (data) => setMoveError(data.message));
    socketService.on('chat_message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    return () => {
      socketService.off('game_state');
      socketService.off('move_made');
      socketService.off('game_ended');
      socketService.off('opponent_disconnected');
      socketService.off('elo_updated');
      socketService.off('draw_offered');
      socketService.off('move_error');
      socketService.off('chat_message');
      socketService.leaveGame(gameId, playerId);
    };
  }, [gameId, playerId, setGame, setMoveHistory, setGameStatus, setEndReason, setWinner, setMoveError]);

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

  const onSquareClick = (square) => {
    if (game.turn() !== colorCode || gameStatus !== 'playing') return;
    
    const piece = game.get(square);

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      // Tap to move: switch selection if clicking another of own pieces
      if (piece && piece.color === colorCode) {
        setSelectedSquare(square);
        haptics.select();
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
        return;
      }

      const moveAttempt = { from: selectedSquare, to: square, promotion: 'q' };
      if (makeMove(moveAttempt)) {
        haptics.move();
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }
    }
    
    if (piece && piece.color === colorCode) {
      setSelectedSquare(square);
      haptics.select();
      setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
    }
  };

  const customSquareStyles = useMemo(() => {
    const styles = {};
    if (selectedSquare) styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    possibleMoves.forEach(s => styles[s] = { background: 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)' });
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
        game={game} onSquareClick={onSquareClick}
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
        handleResign={() => socketService.resignGame(gameId, playerId)}
        navigate={navigate} canReview={gameStatus === 'ended'} onLeave={onLeave}
        capturedPieces={capturedPieces}
      />
    </div>
  );
}
