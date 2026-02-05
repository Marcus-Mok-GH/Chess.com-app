import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from './ChessBoard';
import MoveHistory from './MoveHistory';
import PlayerBar from './PlayerBar';
import AnimatedPiece from './AnimatedPiece';
import ChessPieceIcon from './ChessPieceIcon';
import ConfirmDialog from './ConfirmDialog';
import PromotionDialog from './PromotionDialog';
import { useSettings } from '../contexts/SettingsContext';
import { playSoundEffect } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { normalizeMoveHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import socketService from '../services/socket';

const REACTIONS = ['👍', '👏', '🤔', '😮', '🎉', '😅'];

function safeNewGame(fen) {
  try {
    return fen ? new Chess(fen) : new Chess();
  } catch (error) {
    console.error('[OnlineChessGame] Failed to create game:', error);
    return null;
  }
}

function safeBuildGame(history, fallbackFen) {
  try {
    return buildGameFromHistory(history, fallbackFen);
  } catch (error) {
    console.error('[OnlineChessGame] Failed to rebuild game:', error);
    return safeNewGame();
  }
}

function findKingSquare(game, color) {
  if (!game || typeof game.board !== 'function') return null;
  try {
    const board = game.board();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (piece && piece.type === 'k' && piece.color === color) {
          return String.fromCharCode(97 + col) + (8 - row);
        }
      }
    }
  } catch (error) {
    return null;
  }
  return null;
}

function getCapturedPieces(game) {
  const initial = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
  const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

  if (!game || typeof game.board !== 'function') {
    return { w: [], b: [] };
  }

  try {
    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          current[piece.color][piece.type] += 1;
        }
      }
    }

    const captured = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      for (const piece of ['q', 'r', 'b', 'n', 'p']) {
        const diff = initial[color][piece] - current[color][piece];
        for (let i = 0; i < diff; i += 1) {
          captured[color].push(piece);
        }
      }
    }
    return captured;
  } catch (error) {
    return { w: [], b: [] };
  }
}

function getBoardStatus(game) {
  if (!game || typeof game.isCheckmate !== 'function') return 'playing';
  try {
    if (game.isCheckmate()) return 'checkmate';
    if (game.isStalemate()) return 'stalemate';
    if (game.isDraw()) return 'draw';
    if (game.inCheck()) return 'check';
  } catch (error) {
    return 'playing';
  }
  return 'playing';
}

export default function OnlineChessGame({ gameId, playerId, playerColor, opponentInfo, onLeave, currentUserInfo }) {
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [game, setGame] = useState(() => safeNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [opponentStatus, setOpponentStatus] = useState('connected');
  const [incomingReaction, setIncomingReaction] = useState(null);
  const [gameStatus, setGameStatus] = useState('playing');
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [whitePlayer, setWhitePlayer] = useState({ name: 'White', elo: null });
  const [blackPlayer, setBlackPlayer] = useState({ name: 'Black', elo: null });
  const [eloChange, setEloChange] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferedBy, setDrawOfferedBy] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [winner, setWinner] = useState(null);
  const [resignedPlayerName, setResignedPlayerName] = useState(null);
  const [winnerPlayerName, setWinnerPlayerName] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [showVictory, setShowVictory] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [isConfirmMoveOpen, setIsConfirmMoveOpen] = useState(false);
  const [isResignConfirmOpen, setIsResignConfirmOpen] = useState(false);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);

  const gameRef = useRef(game);
  const settingsRef = useRef(settings);
  const animationIdRef = useRef(0);
  const moveErrorTimeoutRef = useRef(null);
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);
  const reactionTimeoutRef = useRef(null);

  const colorCode = playerColor === 'white' ? 'w' : 'b';
  const boardOrientation = playerColor;

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => () => {
    if (moveErrorTimeoutRef.current) {
      clearTimeout(moveErrorTimeoutRef.current);
    }
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
    if (reactionTimeoutRef.current) {
      clearTimeout(reactionTimeoutRef.current);
    }
  }, []);

  const triggerMoveHaptics = useCallback((moveData, nextGame) => {
    if (!moveData || !nextGame) return;
    try {
      if (nextGame.isCheckmate()) {
        const winnerColor = nextGame.turn() === 'w' ? 'b' : 'w';
        if (winnerColor === colorCode) {
          haptics.win();
        } else {
          haptics.lose();
        }
        return;
      }
      if (nextGame.isDraw()) {
        haptics.draw();
        return;
      }
      if (nextGame.inCheck()) {
        haptics.check();
        return;
      }
      if (moveData.captured) {
        haptics.capture();
        return;
      }
      haptics.move();
    } catch (error) {
      // Ignore
    }
  }, [colorCode]);

  useEffect(() => {
    if (!gameId || !playerId) return;

    const attemptJoin = () => {
      if (socketService.isConnected) {
        socketService.joinGame(gameId, playerId);
      }
    };

    attemptJoin();

    const handleGameState = (data) => {
      const normalizedHistory = normalizeMoveHistory(data.moveHistory);
      const chess = safeBuildGame(normalizedHistory, data.fen);
      setGame(chess);
      setMoveHistory(normalizedHistory);
      setGameStatus(data.status || 'playing');
      setIsLoadingGame(false);

      if (data.whitePlayer) {
        setWhitePlayer({ name: data.whitePlayer, elo: data.whiteElo || null });
      }
      if (data.blackPlayer) {
        setBlackPlayer({ name: data.blackPlayer, elo: data.blackElo || null });
      }
    };

    const handleMoveMade = (data) => {
      if (data.playerId === playerId) return;
      const normalizedHistory = normalizeMoveHistory(data.moveHistory);
      const chess = safeBuildGame(normalizedHistory, data.fen);
      setGame(chess);
      setMoveHistory(normalizedHistory);

      const verboseHistory = chess.history({ verbose: true });
      const lastMove = verboseHistory[verboseHistory.length - 1];
      if (lastMove) {
        triggerMoveHaptics(lastMove, chess);
      }
    };

    const handleGameEnded = (data) => {
      setGameStatus('ended');
      setEndReason(data.reason || null);
      setWinner(data.result || null);
      if (data.resignedPlayerName) {
        setResignedPlayerName(data.resignedPlayerName);
      }
      if (data.winnerPlayerName) {
        setWinnerPlayerName(data.winnerPlayerName);
      }

      const reason = data?.reason || '';
      const skipHaptic = ['checkmate', 'stalemate', 'draw'].includes(reason);
      if (!skipHaptic) {
        if (data.result === 'draw') {
          haptics.draw();
        } else if (data.result) {
          const winnerColor = data.result === 'white' ? 'w' : 'b';
          if (winnerColor === colorCode) {
            haptics.win();
          } else {
            haptics.lose();
          }
        }
      }
    };

    const handlePlayerJoined = () => {
      setOpponentStatus('connected');
    };

    const handlePlayerLeft = (data) => {
      if (data.playerId !== playerId) {
        setOpponentStatus('disconnected');
      }
    };

    const handleOpponentDisconnected = () => {
      setOpponentStatus('disconnected');
    };

    const handleChatMessage = (data) => {
      if (!data || data.playerId === playerId) return;
      if (REACTIONS.includes(data.message)) {
        setIncomingReaction(data.message);
        if (reactionTimeoutRef.current) {
          clearTimeout(reactionTimeoutRef.current);
        }
        reactionTimeoutRef.current = setTimeout(() => setIncomingReaction(null), 2000);
      }
    };

    const handleEloUpdated = (data) => {
      setEloChange(data.change);
    };

    const handleDrawOffered = (data) => {
      if (data.offeredBy !== playerId) {
        setDrawOffered(true);
        setDrawOfferedBy(data.offeredBy);
      }
    };

    const handleDrawDeclined = () => {
      setDrawOffered(false);
      setDrawOfferedBy(null);
    };

    const handleMoveError = (data) => {
      setMoveError(data.message || 'An error occurred while making your move');
      try {
        haptics.illegal();
      } catch (error) {
        // Ignore
      }
      if (moveErrorTimeoutRef.current) {
        clearTimeout(moveErrorTimeoutRef.current);
      }
      moveErrorTimeoutRef.current = setTimeout(() => setMoveError(''), 5000);
    };

    const handleConnectionStatus = (data) => {
      if (data?.connected) {
        attemptJoin();
      }
    };

    socketService.on('game_state', handleGameState);
    socketService.on('move_made', handleMoveMade);
    socketService.on('game_ended', handleGameEnded);
    socketService.on('player_joined', handlePlayerJoined);
    socketService.on('player_left', handlePlayerLeft);
    socketService.on('opponent_disconnected', handleOpponentDisconnected);
    socketService.on('chat_message', handleChatMessage);
    socketService.on('elo_updated', handleEloUpdated);
    socketService.on('draw_offered', handleDrawOffered);
    socketService.on('draw_declined', handleDrawDeclined);
    socketService.on('move_error', handleMoveError);
    socketService.on('connection_status', handleConnectionStatus);

    return () => {
      socketService.off('game_state', handleGameState);
      socketService.off('move_made', handleMoveMade);
      socketService.off('game_ended', handleGameEnded);
      socketService.off('player_joined', handlePlayerJoined);
      socketService.off('player_left', handlePlayerLeft);
      socketService.off('opponent_disconnected', handleOpponentDisconnected);
      socketService.off('chat_message', handleChatMessage);
      socketService.off('elo_updated', handleEloUpdated);
      socketService.off('draw_offered', handleDrawOffered);
      socketService.off('draw_declined', handleDrawDeclined);
      socketService.off('move_error', handleMoveError);
      socketService.off('connection_status', handleConnectionStatus);
      socketService.leaveGame(gameId, playerId);
    };
  }, [gameId, playerId, triggerMoveHaptics, colorCode]);

  useEffect(() => {
    if (opponentInfo) {
      const opponentName = opponentInfo.name || 'Opponent';
      const opponentElo = opponentInfo.elo || null;
      if (playerColor === 'white') {
        setBlackPlayer({ name: opponentName, elo: opponentElo });
      } else {
        setWhitePlayer({ name: opponentName, elo: opponentElo });
      }
    }

    if (currentUserInfo) {
      const userName = currentUserInfo.name || currentUserInfo.username || 'You';
      const userElo = currentUserInfo.elo || null;
      if (playerColor === 'white') {
        setWhitePlayer({ name: userName, elo: userElo });
      } else {
        setBlackPlayer({ name: userName, elo: userElo });
      }
    }
  }, [opponentInfo, playerColor, currentUserInfo]);

  useEffect(() => {
    if (endReason !== 'checkmate' || !winner || !playerColor) return;
    if (winner !== playerColor) return;

    const victoryKey = `${gameId}-${winner}-${endReason}`;
    if (lastVictoryKeyRef.current === victoryKey) {
      return;
    }

    lastVictoryKeyRef.current = victoryKey;
    setShowVictory(true);
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
    victoryTimeoutRef.current = setTimeout(() => setShowVictory(false), 2200);
  }, [endReason, winner, playerColor, gameId]);

  const boardStatus = useMemo(() => getBoardStatus(game), [game]);

  const triggerAnimation = useCallback((moveData) => {
    const animations = [];

    if (moveData.flags && moveData.flags.includes('k')) {
      const rookFrom = moveData.color === 'w' ? 'h1' : 'h8';
      const rookTo = moveData.color === 'w' ? 'f1' : 'f8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else if (moveData.flags && moveData.flags.includes('q')) {
      const rookFrom = moveData.color === 'w' ? 'a1' : 'a8';
      const rookTo = moveData.color === 'w' ? 'd1' : 'd8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else {
      animations.push({
        id: animationIdRef.current++,
        piece: { type: moveData.piece, color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      if (moveData.captured) {
        animations.push({
          id: animationIdRef.current++,
          piece: { type: moveData.captured, color: moveData.color === 'w' ? 'b' : 'w' },
          fromSquare: moveData.to,
          toSquare: moveData.to,
          captured: true,
        });
      }
    }

    setAnimatingPieces((prev) => [...prev, ...animations]);
  }, []);

  const removeAnimation = useCallback((animationId) => {
    setAnimatingPieces((prev) => prev.filter((anim) => anim.id !== animationId));
  }, []);

  const getPromotionInfo = useCallback((from, to) => {
    if (!gameRef.current || typeof gameRef.current.get !== 'function') {
      return { requires: false, promotion: null };
    }
    const piece = gameRef.current.get(from);
    if (!piece || piece.type !== 'p') return { requires: false, promotion: null };

    const promotionRank = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');
    if (!promotionRank) return { requires: false, promotion: null };

    if (settingsRef.current.autoQueen) {
      return { requires: true, promotion: 'q' };
    }

    return { requires: true, promotion: null };
  }, []);

  const applyMove = useCallback((from, to, promotion) => {
    if (!gameRef.current) return false;

    const history = moveHistory || [];
    const nextGame = safeBuildGame(history, gameRef.current.fen());
    const move = nextGame.move({
      from,
      to,
      promotion: promotion || 'q',
    });

    if (!move) return false;

    triggerAnimation(move);

    setTimeout(() => {
      setGame(nextGame);
      setMoveHistory(nextGame.history({ verbose: true }));
      setSelectedSquare(null);
      setPossibleMoves([]);

      socketService.makeMove(
        gameId,
        nextGame.fen(),
        {
          from: move.from,
          to: move.to,
          promotion: move.promotion,
          san: move.san,
        },
        toStoredMoveHistory(nextGame.history({ verbose: true })),
        playerId,
      );

      try {
        if (move.captured) {
          playSoundEffect(settingsRef.current, { type: 'capture' });
        } else {
          playSoundEffect(settingsRef.current, { type: 'move' });
        }
        if (nextGame.inCheck()) {
          playSoundEffect(settingsRef.current, { type: 'check' });
        }
      } catch (error) {
        // Ignore sound errors
      }

      triggerMoveHaptics(move, nextGame);

      if (nextGame.isGameOver()) {
        handleGameOver(nextGame);
      }
    }, 50);

    return true;
  }, [gameId, moveHistory, playerId, triggerAnimation, triggerMoveHaptics]);

  const queueMove = useCallback((from, to) => {
    const promotionInfo = getPromotionInfo(from, to);
    const movingPiece = gameRef.current?.get(from);
    const moveColor = movingPiece?.color || colorCode;

    setSelectedSquare(null);
    setPossibleMoves([]);

    if (promotionInfo.requires && !promotionInfo.promotion) {
      setPendingMove({ from, to, color: moveColor });
      setIsPromotionOpen(true);
      return true;
    }

    const promotion = promotionInfo.promotion;

    if (settingsRef.current.confirmMoves) {
      setPendingMove({ from, to, promotion, color: moveColor });
      setIsConfirmMoveOpen(true);
      return true;
    }

    return applyMove(from, to, promotion);
  }, [applyMove, colorCode, getPromotionInfo]);

  const handlePromotionSelect = useCallback((choice) => {
    if (!pendingMove) return;
    const nextMove = { ...pendingMove, promotion: choice };
    setIsPromotionOpen(false);

    if (settingsRef.current.confirmMoves) {
      setPendingMove(nextMove);
      setIsConfirmMoveOpen(true);
      return;
    }

    setPendingMove(null);
    applyMove(nextMove.from, nextMove.to, nextMove.promotion);
  }, [applyMove, pendingMove]);

  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) {
      setIsConfirmMoveOpen(false);
      return;
    }

    const { from, to, promotion } = pendingMove;
    setIsConfirmMoveOpen(false);
    setPendingMove(null);
    applyMove(from, to, promotion);
  }, [applyMove, pendingMove]);

  const handleCancelPendingMove = useCallback(() => {
    setIsConfirmMoveOpen(false);
    setIsPromotionOpen(false);
    setPendingMove(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, []);

  const onSquareClick = useCallback((square) => {
    if (!gameRef.current) return;
    if (gameRef.current.turn() !== colorCode || gameRef.current.isGameOver() || gameStatus !== 'playing') {
      return;
    }

    const piece = gameRef.current.get(square);

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      const legalMoves = gameRef.current.moves({ square: selectedSquare, verbose: true }) || [];
      const isLegalTarget = legalMoves.some((move) => move.to === square);
      if (isLegalTarget) {
        queueMove(selectedSquare, square);
        return;
      }
    }

    if (piece && piece.color === colorCode) {
      setSelectedSquare(square);
      const moves = gameRef.current.moves({ square, verbose: true }) || [];
      setPossibleMoves(moves.map((move) => move.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }, [colorCode, gameStatus, queueMove, selectedSquare]);

  const onPieceDrop = useCallback((sourceSquare, targetSquare) => {
    if (!gameRef.current) return false;
    if (gameRef.current.turn() !== colorCode || gameRef.current.isGameOver() || gameStatus !== 'playing') {
      return false;
    }

    const legalMoves = gameRef.current.moves({ square: sourceSquare, verbose: true }) || [];
    const isLegalTarget = legalMoves.some((move) => move.to === targetSquare);
    if (!isLegalTarget) return false;

    queueMove(sourceSquare, targetSquare);
    return true;
  }, [colorCode, gameStatus, queueMove]);

  const handleGameOver = (chessGame) => {
    if (!chessGame || typeof chessGame.isCheckmate !== 'function') return;
    let result;
    let reason;

    if (chessGame.isCheckmate()) {
      result = chessGame.turn() === 'w' ? 'black' : 'white';
      reason = 'checkmate';
    } else if (chessGame.isStalemate()) {
      result = 'draw';
      reason = 'stalemate';
    } else if (chessGame.isDraw()) {
      result = 'draw';
      reason = 'draw';
    } else {
      return;
    }

    socketService.endGame(gameId, result, reason);
  };

  const handleResign = () => {
    setIsResignConfirmOpen(true);
  };

  const confirmResign = () => {
    setIsResignConfirmOpen(false);
    try {
      haptics.lose();
    } catch (error) {
      // Ignore
    }
    socketService.resignGame(gameId, playerId);
  };

  const handleOfferDraw = () => {
    socketService.offerDraw(gameId, playerId);
  };

  const handleRespondDraw = (accepted) => {
    socketService.respondDraw(gameId, playerId, accepted);
    setDrawOffered(false);
    setDrawOfferedBy(null);
  };

  const handleSendReaction = useCallback((reaction) => {
    socketService.sendMessage(gameId, playerId, reaction);
  }, [gameId, playerId]);

  const customSquareStyles = useMemo(() => {
    const styles = {};

    if (settings.highlightMoves) {
      if (selectedSquare) {
        styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
      }

      if (gameRef.current) {
        for (const square of possibleMoves) {
          const piece = gameRef.current.get(square);
          styles[square] = {
            background: piece
              ? 'radial-gradient(circle, rgba(255, 0, 0, 0.4) 85%, transparent 85%)'
              : 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)',
            borderRadius: '50%',
          };
        }
      }
    }

    if (gameRef.current?.inCheck?.()) {
      const kingSquare = findKingSquare(gameRef.current, gameRef.current.turn());
      if (kingSquare) {
        styles[kingSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.5)' };
      }
    }

    return styles;
  }, [possibleMoves, selectedSquare, settings.highlightMoves]);

  const capturedPieces = useMemo(() => getCapturedPieces(game), [game]);
  const isMyTurn = game && typeof game.turn === 'function' ? game.turn() === colorCode : false;
  const canReview = boardStatus === 'checkmate'
    || endReason === 'resignation'
    || (gameStatus === 'ended' && winner && winner !== 'draw');
  const isBoardInteractive = gameStatus === 'playing';

  const topPlayer = boardOrientation === 'white'
    ? { name: blackPlayer.name || 'Black', avatar: '👤', rating: blackPlayer.elo || '???', isBot: false, color: 'b' }
    : { name: whitePlayer.name || 'White', avatar: '👤', rating: whitePlayer.elo || '???', isBot: false, color: 'w' };

  const bottomPlayer = boardOrientation === 'white'
    ? { name: whitePlayer.name || 'White', avatar: '👤', rating: whitePlayer.elo || '???', isBot: false, color: 'w' }
    : { name: blackPlayer.name || 'Black', avatar: '👤', rating: blackPlayer.elo || '???', isBot: false, color: 'b' };

  const getStatusMessage = () => {
    if (gameStatus === 'ended') {
      if (endReason === 'resignation') {
        const winnerColor = winner === 'white' ? 'w' : 'b';
        const didIWin = winner === playerColor;
        const displayWinnerName = winnerPlayerName || (winner === 'white' ? 'White' : 'Black');
        const displayResignedName = resignedPlayerName || (winner === 'white' ? 'Black' : 'White');

        if (didIWin) {
          return (
            <>
              <ChessPieceIcon piece="K" color={winnerColor} size={20} /> 🎉 You win! {displayResignedName} resigned
            </>
          );
        }

        return (
          <>
            <ChessPieceIcon piece="K" color={winnerColor} size={20} /> You resigned. {displayWinnerName} wins!
          </>
        );
      }
      if (opponentStatus === 'disconnected') {
        return '🚪 Opponent disconnected';
      }
      if (winner === 'draw') {
        return '½-½ Draw!';
      }
    }

    if (boardStatus === 'checkmate') {
      if (!game || typeof game.turn !== 'function') return 'Checkmate!';
      const winnerColor = game.turn() === 'w' ? 'b' : 'w';
      const didIWin = (game.turn() === 'w' ? 'black' : 'white') === playerColor;
      return (
        <>
          <ChessPieceIcon piece="K" color={winnerColor} size={20} /> {didIWin ? '🎉 You win by checkmate!' : 'Checkmate!'}
        </>
      );
    }

    if (boardStatus === 'stalemate') return '½-½ Stalemate!';
    if (boardStatus === 'draw') return '½-½ Draw!';
    if (boardStatus === 'check') {
      if (!game || typeof game.turn !== 'function') return 'Check!';
      return (
        <>
          <ChessPieceIcon piece="K" color={game.turn()} size={20} /> {game.turn() === 'w' ? 'White' : 'Black'} is in check!
        </>
      );
    }
    if (isMyTurn) return '🎯 Your turn';
    return "⏳ Opponent's turn";
  };

  if (isLoadingGame) {
    return (
      <div className="online-chess-game">
        <div
          className="game-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid rgba(127, 166, 80, 0.3)',
                borderTopColor: 'var(--color-accent-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading game...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="online-chess-game">
        <div className="game-container" style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h2>Unable to load game</h2>
            <button type="button" className="btn btn-primary" onClick={onLeave}>
              Back to Online
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="online-chess-game">
      <div className="game-container">
        <div className="board-section">
          <PlayerBar
            {...topPlayer}
            isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}
            capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}
          />
          <div className="board-wrapper">
            <ChessBoard
              position={game}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              customSquareStyles={customSquareStyles}
              showCoordinates={settings.showCoordinates}
              boardTheme={settings.boardTheme}
              isInteractive={isBoardInteractive}
            />
            {animatingPieces.map((anim) => (
              <AnimatedPiece
                key={anim.id}
                piece={anim.piece}
                fromSquare={anim.fromSquare}
                toSquare={anim.toSquare}
                boardOrientation={boardOrientation}
                captured={anim.captured}
                onComplete={() => removeAnimation(anim.id)}
              />
            ))}
            {incomingReaction && (
              <div className="incoming-reaction">{incomingReaction}</div>
            )}
            {showVictory && (
              <div className="victory-burst" role="status" aria-live="polite">
                <span className="victory-spark" />
                <span className="victory-text">Checkmate!</span>
              </div>
            )}
          </div>
          <PlayerBar
            {...bottomPlayer}
            isActive={game.turn() === (boardOrientation === 'white' ? 'w' : 'b')}
            capturedPieces={capturedPieces[bottomPlayer.color === 'w' ? 'b' : 'w']}
          />
        </div>

        <div className="sidebar">
          <div className="online-game-info">
            <div className="game-code-display">
              <span className="label">Game Code</span>
              <span className="code">{gameId}</span>
            </div>
            <div className={`opponent-status ${opponentStatus}`}>
              <span className="status-dot"></span>
              <span>Opponent {opponentStatus}</span>
            </div>
            {eloChange !== null && (
              <div className={`elo-change ${eloChange > 0 ? 'elo-gain' : eloChange < 0 ? 'elo-loss' : 'elo-neutral'}`}>
                <span className="elo-label">Rating Change:</span>
                <span className="elo-value">{eloChange > 0 ? '+' : ''}{eloChange}</span>
              </div>
            )}
          </div>

          <div className="game-status-panel">
            {moveError && (
              <div className="error-message">{moveError}</div>
            )}
            {gameStatus === 'ended' && (
              <div className={`game-result-panel ${winner === playerColor ? 'victory' : winner === 'draw' ? '' : 'defeat'}`}>
                <div className={`result-title ${winner === playerColor ? 'victory' : winner === 'draw' ? 'draw' : 'defeat'}`}>
                  {winner === playerColor ? '🎉 Victory!' : winner === 'draw' ? '🤝 Draw' : '😔 Defeat'}
                </div>
                {endReason === 'resignation' && (
                  <div className="result-reason">
                    {winner === playerColor
                      ? `${resignedPlayerName || 'Opponent'} resigned`
                      : 'You resigned'}
                  </div>
                )}
                {endReason === 'checkmate' && (
                  <div className="result-reason">Checkmate</div>
                )}
                {eloChange !== null && (
                  <div className={`elo-change ${eloChange > 0 ? 'elo-gain' : eloChange < 0 ? 'elo-loss' : 'elo-neutral'}`}>
                    <span className="elo-label">Rating:</span>
                    <span className="elo-value">{eloChange > 0 ? '+' : ''}{eloChange}</span>
                  </div>
                )}
              </div>
            )}
            <div className={`status-message ${boardStatus}`}>{getStatusMessage()}</div>
            <div className="player-color">
              You play as: <ChessPieceIcon piece="K" color={playerColor === 'white' ? 'w' : 'b'} size={18} /> {playerColor === 'white' ? 'White' : 'Black'}
            </div>
          </div>

          {drawOffered && (
            <div className="draw-offer-panel">
              <p>Opponent offers a draw</p>
              <div className="draw-buttons">
                <button onClick={() => handleRespondDraw(true)} className="btn btn-primary">
                  Accept
                </button>
                <button onClick={() => handleRespondDraw(false)} className="btn btn-secondary">
                  Decline
                </button>
              </div>
            </div>
          )}

          <div className="reactions-panel">
            <span className="reactions-label">Quick Reactions</span>
            <div className="reactions-grid">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction}
                  className="reaction-btn"
                  onClick={() => handleSendReaction(reaction)}
                >
                  {reaction}
                </button>
              ))}
            </div>
          </div>

          <MoveHistory history={moveHistory} />

          <div className="online-controls">
            {gameStatus === 'playing' && (
              <>
                <button onClick={handleOfferDraw} className="btn btn-secondary" disabled={drawOffered}>
                  🤝 Offer Draw
                </button>
                <button onClick={handleResign} className="btn btn-danger">
                  🏳️ Resign
                </button>
              </>
            )}
            <button
              onClick={() => navigate(`/analysis/${gameId}`, { state: { moveHistory } })}
              className="btn btn-primary"
              disabled={!canReview}
            >
              🧠 Game Review
            </button>
            <button onClick={onLeave} className="btn btn-danger">
              🚪 Leave Game
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmMoveOpen}
        title="Confirm Move"
        message="Make this move?"
        confirmLabel="Move"
        onConfirm={handleConfirmMove}
        onCancel={handleCancelPendingMove}
      />
      <PromotionDialog
        open={isPromotionOpen}
        color={pendingMove?.color || colorCode}
        onSelect={handlePromotionSelect}
        onCancel={handleCancelPendingMove}
      />
      <ConfirmDialog
        open={isResignConfirmOpen}
        title="Confirm Resign"
        message="Are you sure you want to resign? This will count as a loss."
        confirmLabel="Resign"
        onConfirm={confirmResign}
        onCancel={() => setIsResignConfirmOpen(false)}
      />
    </div>
  );
}
