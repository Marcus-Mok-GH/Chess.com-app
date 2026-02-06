import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from './ChessBoard';
import MoveHistory from './MoveHistory';
import GameControls from './GameControls';
import BotSelector from './BotSelector';
import PlayerBar from './PlayerBar';
import DebugPanel from './DebugPanel';
import AnimatedPiece from './AnimatedPiece';
import CoachingTip from './CoachingTip';
import AIDialogueDrawer from './AIDialogueDrawer';
import ConfirmDialog from './ConfirmDialog';
import PromotionDialog from './PromotionDialog';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import { playSoundEffect } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { BOTS, getRandomQuote, createCustomBot } from '../engine/bots/bots';
import { getCoachingFeedback } from '../engine/coach/coachAI';
import { generateGameId } from '../engine/game/gameId';
import { normalizeMoveHistory, toSanHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import api from '../services/api';
import StockfishWorker from '../engine/workers/stockfishWorker.js?worker';
import './ChessGame.css';

function safeNewGame(fen) {
  try {
    return fen ? new Chess(fen) : new Chess();
  } catch (error) {
    console.error('[ChessGame] Failed to create game:', error);
    return null;
  }
}

function safeBuildGame(history, fallbackFen) {
  try {
    return buildGameFromHistory(history, fallbackFen);
  } catch (error) {
    console.error('[ChessGame] Failed to rebuild game:', error);
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

function getGameStatus(game, hasResigned) {
  if (hasResigned) return 'resigned';
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

function normalizeDebugInfo(info, bestMove) {
  if (!info || typeof info !== 'object') return null;
  return {
    time: info.time ?? 0,
    depth: info.depth ?? 0,
    bestMove: info.selected || info.engineBest || bestMove,
    moves: info.moves || [],
    current: info.current,
    progress: info.progress,
    evaluating: info.evaluating,
  };
}

const PASS_AND_PLAY_BOT = {
  id: 'pass',
  name: 'Pass & Play',
  rating: 'Local',
  avatar: '🤝',
  color: '#5d9cec',
  personality: 'Two-player local match',
  isCoach: false,
};

function ChessGame(
  {
    initialSelectedBot,
    initialCustomElo,
    initialBoardOrientation,
    initialPlayerColor,
    gameMode = 'bot',
    passAndPlayConfig = {},
    onUiStateChange,
    initialGameId,
  },
  ref,
) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, isOnline, updateElo } = useUser();

  const isPassAndPlay = gameMode === 'pass';
  const passConfig = passAndPlayConfig || {};
  const whitePlayerName = (passConfig.whitePlayerName || 'White').trim() || 'White';
  const blackPlayerName = (passConfig.blackPlayerName || 'Black').trim() || 'Black';
  const autoFlipBoard = passConfig.autoFlipBoard ?? true;

  const [game, setGame] = useState(() => safeNewGame());
  const [boardOrientation, setBoardOrientation] = useState(initialBoardOrientation || 'white');
  const [playerColor, setPlayerColor] = useState(initialPlayerColor || 'w');
  const [selectedBot, setSelectedBot] = useState(() => {
    if (isPassAndPlay) return PASS_AND_PLAY_BOT;
    return initialSelectedBot || BOTS.find((bot) => bot.id === 'nelson') || BOTS[0];
  });
  const [customElo, setCustomElo] = useState(initialCustomElo ?? 1000);
  const [isThinking, setIsThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [botMessage, setBotMessage] = useState('');
  const [hintMove, setHintMove] = useState(null);
  const [isDialogueOpen, setIsDialogueOpen] = useState(false);
  const [gameId, setGameId] = useState(() => (initialGameId ? String(initialGameId).toUpperCase() : generateGameId()));
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [coachingTip, setCoachingTip] = useState(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [hasResigned, setHasResigned] = useState(false);
  const [resignedColor, setResignedColor] = useState(null);
  const [showVictory, setShowVictory] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [isConfirmMoveOpen, setIsConfirmMoveOpen] = useState(false);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);
  const [isResignConfirmOpen, setIsResignConfirmOpen] = useState(false);

  const gameRef = useRef(game);
  const moveHistoryRef = useRef(moveHistory);
  const selectedBotRef = useRef(selectedBot);
  const customEloRef = useRef(customElo);
  const settingsRef = useRef(settings);
  const workerRef = useRef(null);
  const workerBusyRef = useRef(false);
  const persistTimeoutRef = useRef(null);
  const suppressPersistRef = useRef(false);
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);
  const animationIdRef = useRef(0);
  const boardWrapperRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const mountedRef = useRef(true);

  const gameStatus = useMemo(() => getGameStatus(game, hasResigned), [game, hasResigned]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  useEffect(() => {
    selectedBotRef.current = selectedBot;
  }, [selectedBot]);

  useEffect(() => {
    customEloRef.current = customElo;
  }, [customElo]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!botMessage) return;
    setIsDialogueOpen(true);
  }, [botMessage]);

  useEffect(() => {
    const worker = new StockfishWorker();
    workerRef.current = worker;

    worker.onerror = (error) => {
      console.error('[ChessGame] Stockfish worker error:', error);
      workerBusyRef.current = false;
    };

    return () => {
      try {
        worker.terminate();
      } catch (error) {
        // Ignore worker shutdown errors
      }
    };
  }, []);

  useEffect(() => () => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (isPassAndPlay) {
      setHasLoadedPersistedState(true);
      return;
    }
    if (hasLoadedPersistedState || !initialGameId) return;

    let isMounted = true;
    const loadState = async () => {
      try {
        if (!user) {
          setHasLoadedPersistedState(true);
          return;
        }

        const match = await api.getLocalGameByCode(user.username, gameId);
        if (!isMounted) return;

        if (!match) {
          setHasLoadedPersistedState(true);
          return;
        }

        const normalizedHistory = normalizeMoveHistory(match.move_history);
        if (!match?.fen) {
          setMoveHistory(normalizedHistory);
          setHasLoadedPersistedState(true);
          return;
        }

        const restoredGame = safeBuildGame(normalizedHistory, match.fen);
        setGame(restoredGame);
        setMoveHistory(normalizedHistory);
        setHasLoadedPersistedState(true);
      } catch (error) {
        console.error('[ChessGame] Failed to load saved game state:', error);
        if (isMounted) {
          setHasLoadedPersistedState(true);
        }
      }
    };

    loadState();

    return () => {
      isMounted = false;
    };
  }, [gameId, hasLoadedPersistedState, initialGameId, isPassAndPlay, user]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (moveHistory.length === 0) {
      setBotMessage(getRandomQuote(selectedBot, 'start'));
    }
  }, [selectedBot, moveHistory.length, isPassAndPlay]);

  useEffect(() => {
    if (!onUiStateChange) return;
    const minUndoMoves = isPassAndPlay ? 1 : 2;
    onUiStateChange({
      isThinking,
      canUndo: moveHistory.length >= minUndoMoves,
      gameStatus,
    });
  }, [isThinking, moveHistory.length, gameStatus, onUiStateChange, isPassAndPlay]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (!initialGameId || !hasLoadedPersistedState || !gameRef.current) return;
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false;
      return;
    }
    if (!isOnline || !user) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(async () => {
      try {
        const currentGame = gameRef.current;
        const history = moveHistoryRef.current || [];
        if (!currentGame) return;

        const gameResult = currentGame.isCheckmate()
          ? (currentGame.turn() === 'w' ? 'black' : 'white')
          : currentGame.isDraw()
            ? 'draw'
            : 'in_progress';

        const bot = selectedBotRef.current;
        const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;
        const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;
        const storedHistory = toStoredMoveHistory(history);

        await api.saveGame({
          gameCode: gameId,
          moveHistory: storedHistory,
          result: gameResult,
          gameMode: 'local',
          userId: user.id,
          username: user.username,
          opponentName: botName,
          opponentElo: botElo,
          playerColor: playerColor === 'w' ? 'white' : 'black',
          finalFen: currentGame.fen(),
        });
      } catch (error) {
        console.error('[ChessGame] Failed to autosave game state:', error);
      }
    }, 600);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [gameId, hasLoadedPersistedState, initialGameId, isOnline, isPassAndPlay, moveHistory.length, playerColor, user]);

  useEffect(() => {
    if (!gameRef.current) return;

    const isCheckmate = gameRef.current.isCheckmate();
    const winner = isCheckmate ? (gameRef.current.turn() === 'w' ? 'b' : 'w') : null;
    const didPlayerWin = isCheckmate && winner === playerColor;
    const shouldShowVictory = isPassAndPlay ? isCheckmate : didPlayerWin;

    if (!shouldShowVictory) {
      setShowVictory(false);
      return;
    }

    const victoryKey = `${gameRef.current.fen()}-${winner}`;
    if (lastVictoryKeyRef.current === victoryKey) {
      return;
    }

    lastVictoryKeyRef.current = victoryKey;
    setShowVictory(true);
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
    victoryTimeoutRef.current = setTimeout(() => setShowVictory(false), 2200);
  }, [game, playerColor, isPassAndPlay]);

  useEffect(() => {
    if (!isPassAndPlay || !autoFlipBoard || !gameRef.current) return;
    const nextOrientation = gameRef.current.turn() === 'w' ? 'white' : 'black';
    setBoardOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));
  }, [game, isPassAndPlay, autoFlipBoard]);

  const triggerAnimation = useCallback((moveData) => {
    if (!moveData) return;
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

  const requestWorker = useCallback((kind, payload) => {
    const worker = workerRef.current;
    if (!worker || workerBusyRef.current) {
      return Promise.resolve(null);
    }

    workerBusyRef.current = true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        workerBusyRef.current = false;
        worker.removeEventListener('message', handleMessage);
        resolve({ error: true });
      }, 10000);

      const handleMessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
          if (settingsRef.current.debugMode && kind === 'bot') {
            setDebugInfo(normalizeDebugInfo(data.debugInfo || data));
          }
          return;
        }
        if (kind === 'analysis' && data.type !== 'analysis') return;
        if (kind !== 'analysis' && data.type !== 'result') return;

        clearTimeout(timeout);
        workerBusyRef.current = false;
        worker.removeEventListener('message', handleMessage);
        resolve(data);
      };

      worker.addEventListener('message', handleMessage);
      worker.postMessage(payload);
    });
  }, []);

  const triggerMoveHaptics = useCallback((moveData, nextGame) => {
    if (!moveData || !nextGame) return;
    try {
      if (nextGame.isCheckmate()) {
        const winnerColor = nextGame.turn() === 'w' ? 'b' : 'w';
        if (isPassAndPlay || winnerColor === playerColor) {
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
      // Ignore haptic errors
    }
  }, [isPassAndPlay, playerColor]);

  const requestCoachingFeedback = useCallback(async (fenBefore, move, history) => {
    if (isPassAndPlay || !selectedBotRef.current?.isCoach) return;
    setIsCoachingLoading(true);
    setBotMessage('Analyzing your move...');

    try {
      const feedback = await getCoachingFeedback(fenBefore, move, toSanHistory(history), (streamedText) => {
        if (mountedRef.current) {
          setBotMessage(streamedText);
        }
      });

      if (feedback && mountedRef.current) {
        setBotMessage(feedback);
        setCoachingTip(feedback);
      }
    } catch (error) {
      console.error('[ChessGame] Coaching feedback error:', error);
      if (mountedRef.current) {
        setBotMessage('Analysis unavailable');
      }
    } finally {
      if (mountedRef.current) {
        setIsCoachingLoading(false);
      }
    }
  }, [isPassAndPlay]);

  const applyMove = useCallback((from, to, promotion) => {
    const currentGame = gameRef.current;
    if (!currentGame) return false;

    const fenBefore = currentGame.fen();
    const history = moveHistoryRef.current || [];
    const nextGame = safeBuildGame(history, fenBefore);
    const move = nextGame.move({
      from,
      to,
      promotion: promotion || 'q',
    });

    if (!move) return false;

    triggerAnimation(move);

    setTimeout(() => {
      if (!mountedRef.current) return;
      setGame(nextGame);
      const nextHistory = nextGame.history({ verbose: true });
      setMoveHistory(nextHistory);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setHintMove(null);

      if (!isPassAndPlay) {
        const bot = selectedBotRef.current;
        if (nextGame.isCheckmate()) {
          setBotMessage(getRandomQuote(bot, 'lose'));
        } else if (nextGame.isDraw()) {
          setBotMessage(getRandomQuote(bot, 'draw'));
        } else if (move.captured) {
          setBotMessage(getRandomQuote(bot, 'captured'));
        } else if (Math.random() < 0.2) {
          setBotMessage(getRandomQuote(bot, 'goodMove'));
        }
      }

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
      requestCoachingFeedback(fenBefore, move.san, nextHistory);
    }, 50);

    return true;
  }, [isPassAndPlay, requestCoachingFeedback, triggerAnimation, triggerMoveHaptics]);

  const getPromotionInfo = useCallback((from, to) => {
    const currentGame = gameRef.current;
    if (!currentGame || typeof currentGame.get !== 'function') {
      return { requires: false, promotion: null };
    }
    const piece = currentGame.get(from);
    if (!piece || piece.type !== 'p') return { requires: false, promotion: null };

    const promotionRank = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');
    if (!promotionRank) return { requires: false, promotion: null };

    if (settingsRef.current.autoQueen) {
      return { requires: true, promotion: 'q' };
    }

    return { requires: true, promotion: null };
  }, []);

  const queueMove = useCallback((from, to) => {
    const promotionInfo = getPromotionInfo(from, to);
    const currentGame = gameRef.current;
    const movingPiece = currentGame?.get?.(from);
    const moveColor = movingPiece?.color || playerColor;

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
  }, [applyMove, getPromotionInfo, playerColor]);

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
  }, [pendingMove, applyMove]);

  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) {
      setIsConfirmMoveOpen(false);
      return;
    }

    const { from, to, promotion } = pendingMove;
    setIsConfirmMoveOpen(false);
    setPendingMove(null);
    applyMove(from, to, promotion);
  }, [pendingMove, applyMove]);

  const handleCancelPendingMove = useCallback(() => {
    setIsConfirmMoveOpen(false);
    setIsPromotionOpen(false);
    setPendingMove(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, []);

  const makeAIMove = useCallback(async () => {
    if (isPassAndPlay) return;
    const currentGame = gameRef.current;
    if (!currentGame || currentGame.isGameOver() || isThinking) return;
    if (!workerRef.current || workerBusyRef.current) return;

    setIsThinking(true);

    const configuredBot = selectedBotRef.current?.id === 'custom'
      ? createCustomBot(customEloRef.current)
      : selectedBotRef.current;

    if (configuredBot) {
      setBotMessage(getRandomQuote(configuredBot, 'thinking'));
    }

    const fen = currentGame.fen();
    const response = await requestWorker('bot', {
      fen,
      bot: {
        name: configuredBot?.name || 'Bot',
        depth: configuredBot?.depth,
        nodes: configuredBot?.nodes,
        blunderChance: configuredBot?.blunderChance,
        missedTacticsChance: configuredBot?.missedTacticsChance,
        playStyle: configuredBot?.playStyle,
      },
      debug: settingsRef.current.debugMode,
    });

    if (!mountedRef.current) return;

    const bestMove = response?.bestMove;
    if (response?.debugInfo && settingsRef.current.debugMode) {
      setDebugInfo(normalizeDebugInfo(response.debugInfo, bestMove));
    }

    let moveApplied = false;
    if (bestMove) {
      const history = moveHistoryRef.current || [];
      const nextGame = safeBuildGame(history, fen);
      const move = nextGame.move(bestMove);
      if (move) {
        triggerAnimation(move);
        setTimeout(() => {
          if (!mountedRef.current) return;
          setGame(nextGame);
          setMoveHistory(nextGame.history({ verbose: true }));

          if (configuredBot) {
            if (nextGame.isCheckmate()) {
              setBotMessage(getRandomQuote(configuredBot, 'win'));
            } else if (nextGame.isDraw()) {
              setBotMessage(getRandomQuote(configuredBot, 'draw'));
            } else if (nextGame.inCheck()) {
              setBotMessage(getRandomQuote(configuredBot, 'check'));
            } else if (move.captured) {
              setBotMessage(getRandomQuote(configuredBot, 'capture'));
            } else if (Math.random() < 0.15) {
              const categories = ['thinking', 'blunder', 'goodMove'];
              setBotMessage(getRandomQuote(configuredBot, categories[Math.floor(Math.random() * categories.length)]));
            }
          }

          triggerMoveHaptics(move, nextGame);
        }, 50);
        moveApplied = true;
      }
    }

    if (!moveApplied) {
      const fallbackMoves = currentGame.moves();
      if (fallbackMoves.length > 0) {
        const history = moveHistoryRef.current || [];
        const nextGame = safeBuildGame(history, fen);
        const move = nextGame.move(fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)]);
        if (move) {
          triggerAnimation(move);
          setTimeout(() => {
            if (!mountedRef.current) return;
            setGame(nextGame);
            setMoveHistory(nextGame.history({ verbose: true }));
            triggerMoveHaptics(move, nextGame);
          }, 50);
        }
      }
    }

    if (mountedRef.current) {
      setIsThinking(false);
    }
  }, [isPassAndPlay, isThinking, requestWorker, triggerAnimation, triggerMoveHaptics]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (!gameRef.current) return;
    if (gameRef.current.turn() !== playerColor && !gameRef.current.isGameOver() && !isThinking) {
      const timer = setTimeout(() => {
        if (gameRef.current.turn() !== playerColor && !gameRef.current.isGameOver() && !isThinking) {
          makeAIMove();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [game, playerColor, isThinking, makeAIMove, isPassAndPlay]);

  const onSquareClick = useCallback((square) => {
    const currentGame = gameRef.current;
    if (!currentGame) return;
    const activeColor = currentGame.turn();
    if (hasResigned || currentGame.isGameOver() || isThinking) return;
    if (!isPassAndPlay && activeColor !== playerColor) return;

    const piece = currentGame.get(square);

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      const legalMoves = currentGame.moves({ square: selectedSquare, verbose: true }) || [];
      const isLegalTarget = legalMoves.some((move) => move.to === square);
      if (isLegalTarget) {
        queueMove(selectedSquare, square);
        return;
      }
    }

    const selectableColor = isPassAndPlay ? activeColor : playerColor;
    if (piece && piece.color === selectableColor) {
      setSelectedSquare(square);
      const moves = currentGame.moves({ square, verbose: true }) || [];
      setPossibleMoves(moves.map((move) => move.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }, [hasResigned, isThinking, isPassAndPlay, playerColor, queueMove, selectedSquare]);

  const onPieceDrop = useCallback((sourceSquare, targetSquare) => {
    const currentGame = gameRef.current;
    if (!currentGame) return false;
    if (hasResigned || currentGame.isGameOver() || isThinking) return false;
    if (!isPassAndPlay && currentGame.turn() !== playerColor) return false;

    const legalMoves = currentGame.moves({ square: sourceSquare, verbose: true }) || [];
    const isLegalTarget = legalMoves.some((move) => move.to === targetSquare);
    if (!isLegalTarget) return false;

    queueMove(sourceSquare, targetSquare);
    return true;
  }, [hasResigned, isThinking, isPassAndPlay, playerColor, queueMove]);

  const handleNewGame = useCallback(() => {
    suppressPersistRef.current = true;
    const newId = generateGameId();
    setGameId(newId);
    const newGame = safeNewGame();
    setGame(newGame);
    setMoveHistory([]);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setIsThinking(false);
    setHintMove(null);
    setHasResigned(false);
    setResignedColor(null);
    setCoachingTip(null);

    if (!isPassAndPlay) {
      setBotMessage(getRandomQuote(selectedBotRef.current, 'start'));
    } else {
      setBotMessage('');
    }

    setHasLoadedPersistedState(true);
  }, [isPassAndPlay]);

  const handleUndo = useCallback(() => {
    const currentGame = gameRef.current;
    if (!currentGame) return;

    const history = moveHistoryRef.current || [];
    const undoCount = isPassAndPlay ? 1 : 2;
    if (history.length < undoCount) return;

    const gameCopy = safeBuildGame(history, currentGame.fen());
    for (let i = 0; i < undoCount; i += 1) {
      gameCopy.undo();
    }

    setGame(gameCopy);
    setMoveHistory(gameCopy.history({ verbose: true }));
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [isPassAndPlay]);

  const handleFlipBoard = useCallback(() => {
    const nextOrientation = boardOrientation === 'white' ? 'black' : 'white';
    setBoardOrientation(nextOrientation);
    if (!isPassAndPlay) {
      setPlayerColor(nextOrientation === 'white' ? 'w' : 'b');
    }
  }, [boardOrientation, isPassAndPlay]);

  const handleSelectBot = useCallback((bot) => {
    if (isPassAndPlay) return;
    setSelectedBot(bot);
    setBotMessage(getRandomQuote(bot, 'start'));
  }, [isPassAndPlay]);

  const handleCustomEloChange = useCallback((newElo) => {
    setCustomElo(newElo);
  }, []);

  const handleGetHint = useCallback(async () => {
    if (!settingsRef.current.showHints) return;
    const currentGame = gameRef.current;
    if (!currentGame || currentGame.isGameOver() || isThinking) return;

    const response = await requestWorker('hint', {
      fen: currentGame.fen(),
      bot: { name: 'Hint', depth: 8, nodes: 5000 },
      debug: false,
    });

    if (!response?.bestMove) return;

    const move = response.bestMove;
    setHintMove({ from: move.substring(0, 2), to: move.substring(2, 4) });
    setTimeout(() => setHintMove(null), 3000);
  }, [isThinking, requestWorker]);

  const handleReview = useCallback(() => {
    navigate(`/analysis/${gameId}`, { state: { moveHistory } });
  }, [navigate, gameId, moveHistory]);

  const saveGameToDatabase = useCallback(async (reason, forcedResult = null) => {
    if (isPassAndPlay) return;
    if (!isOnline || !user) return;
    const currentGame = gameRef.current;
    if (!currentGame) return;

    try {
      let result = forcedResult;
      if (!result) {
        if (reason === 'resigned') {
          result = forcedResult;
        } else if (currentGame.isCheckmate()) {
          result = currentGame.turn() === 'w' ? 'black' : 'white';
        } else if (currentGame.isDraw()) {
          result = 'draw';
        } else {
          result = 'unknown';
        }
      }

      const bot = selectedBotRef.current;
      const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;
      const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;
      const storedHistory = toStoredMoveHistory(moveHistoryRef.current || []);

      await api.saveGame({
        gameCode: gameId,
        moveHistory: storedHistory,
        result,
        gameMode: 'local',
        userId: user.id,
        username: user.username,
        opponentName: botName,
        opponentElo: botElo,
        playerColor: playerColor === 'w' ? 'white' : 'black',
        finalFen: currentGame.fen(),
      });

      if (result !== 'unknown') {
        let playerResult = 'draw';
        if (result === 'white') {
          playerResult = playerColor === 'w' ? 'win' : 'loss';
        } else if (result === 'black') {
          playerResult = playerColor === 'b' ? 'win' : 'loss';
        } else if (result === 'draw') {
          playerResult = 'draw';
        }
        await updateElo(botElo, playerResult);
      }
    } catch (error) {
      console.error('[ChessGame] Failed to save game:', error);
    }
  }, [gameId, isOnline, isPassAndPlay, playerColor, updateElo, user]);

  const handleResign = useCallback(() => {
    if (hasResigned || !gameRef.current || gameRef.current.isGameOver()) return;
    setIsResignConfirmOpen(true);
  }, [hasResigned]);

  const confirmResign = useCallback(() => {
    const currentGame = gameRef.current;
    if (!currentGame || hasResigned || currentGame.isGameOver()) return;

    const resigningColor = isPassAndPlay ? currentGame.turn() : playerColor;
    const winnerColor = resigningColor === 'w' ? 'black' : 'white';

    try {
      haptics.lose();
    } catch (error) {
      // Ignore
    }

    setHasResigned(true);
    setResignedColor(resigningColor);
    setSelectedSquare(null);
    setPossibleMoves([]);

    if (!isPassAndPlay) {
      setBotMessage(getRandomQuote(selectedBotRef.current, 'win'));
    } else {
      setBotMessage('');
    }

    saveGameToDatabase('resigned', winnerColor);
    setIsResignConfirmOpen(false);
  }, [hasResigned, isPassAndPlay, playerColor, saveGameToDatabase]);

  useEffect(() => {
    if (gameStatus !== 'playing' && !hasResigned && moveHistory.length > 0) {
      saveGameToDatabase('game_end');
    }
  }, [gameStatus, hasResigned, moveHistory.length, saveGameToDatabase]);

  useImperativeHandle(
    ref,
    () => ({
      newGame: handleNewGame,
      undo: handleUndo,
      flipBoard: handleFlipBoard,
      hint: handleGetHint,
      resign: handleResign,
      review: handleReview,
      getStatus: () => gameStatus,
    }),
    [handleNewGame, handleUndo, handleFlipBoard, handleGetHint, handleResign, handleReview, gameStatus],
  );

  useEffect(() => {
    const element = boardWrapperRef.current;
    if (!element) return;

    const SWIPE_THRESHOLD = 60;
    const SWIPE_TIMEOUT = 300;
    const RESTRAINT = 100;

    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (event) => {
      const touch = event.changedTouches[0];
      const distX = touch.clientX - touchStartRef.current.x;
      const distY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      if (elapsed <= SWIPE_TIMEOUT && Math.abs(distX) >= SWIPE_THRESHOLD && Math.abs(distY) <= RESTRAINT) {
        if (distX > 0) {
          const minMoves = isPassAndPlay ? 1 : 2;
          if (moveHistoryRef.current.length >= minMoves && !isThinking) {
            try {
              haptics.swipe();
            } catch (error) {
              // Ignore
            }
            handleUndo();
          }
        } else {
          try {
            haptics.swipe();
          } catch (error) {
            // Ignore
          }
          handleFlipBoard();
        }
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleFlipBoard, handleUndo, isThinking, isPassAndPlay]);

  if (!game) {
    return (
      <div className="chess-game-error">
        <div className="error-message">
          <h2>⚠️ Game Initialization Error</h2>
          <p>Failed to initialize the chess game. Please refresh the page.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  const customSquareStyles = useMemo(() => {
    const styles = {};
    if (!gameRef.current) return styles;

    if (settings.highlightMoves) {
      if (selectedSquare) {
        styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
      }

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

    if (gameRef.current.inCheck()) {
      const kingSquare = findKingSquare(gameRef.current, gameRef.current.turn());
      if (kingSquare) {
        styles[kingSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.5)' };
      }
    }

    if (hintMove && settings.showHints) {
      styles[hintMove.from] = { backgroundColor: 'rgba(0, 255, 0, 0.5)' };
      styles[hintMove.to] = { backgroundColor: 'rgba(0, 255, 0, 0.5)' };
    }

    return styles;
  }, [hintMove, possibleMoves, selectedSquare, settings.highlightMoves, settings.showHints, game]);

  const capturedPieces = useMemo(() => getCapturedPieces(game), [game]);

  const botPlayer = {
    name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name,
    avatar: selectedBot?.avatar,
    rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating,
    isBot: true,
    color: 'b',
    botColor: selectedBot?.color,
    isCoach: selectedBot?.isCoach,
  };

  const humanPlayer = { name: 'You', avatar: '👤', rating: '???', isBot: false, color: 'w', isCoach: false };
  const passWhitePlayer = { name: whitePlayerName, avatar: '👤', rating: 'Local', isBot: false, color: 'w', isCoach: false };
  const passBlackPlayer = { name: blackPlayerName, avatar: '👤', rating: 'Local', isBot: false, color: 'b', isCoach: false };

  const topPlayer = isPassAndPlay
    ? (boardOrientation === 'white' ? passBlackPlayer : passWhitePlayer)
    : (boardOrientation === 'white' ? botPlayer : humanPlayer);

  const bottomPlayer = isPassAndPlay
    ? (boardOrientation === 'white' ? passWhitePlayer : passBlackPlayer)
    : (boardOrientation === 'white' ? humanPlayer : botPlayer);

  const canReview = gameStatus === 'checkmate' || gameStatus === 'resigned';
  const isBoardInteractive = !hasResigned && !game.isGameOver();

  return (
    <div className="chess-game">
      <div className="game-container">
        <div className="board-section">
          <PlayerBar
            {...topPlayer}
            isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}
            capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}
            botMessage={topPlayer.isBot ? botMessage : null}
          />
          <div className="board-wrapper" ref={boardWrapperRef}>
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
          {settings.debugMode && (
            <DebugPanel debugInfo={debugInfo} isThinking={isThinking} />
          )}
        </div>

        <div className="sidebar">
          <div className="sidebar-header">
            <span className="game-id-label" title="Game ID">Game {gameId}</span>
          </div>
          {!isPassAndPlay && (
            <BotSelector
              selectedBot={selectedBot}
              onSelectBot={handleSelectBot}
              disabled={isThinking}
              customElo={customElo}
              onCustomEloChange={handleCustomEloChange}
            />
          )}
          <GameControls
            gameStatus={gameStatus}
            turn={game.turn()}
            playerColor={playerColor}
            selectedBot={selectedBot}
            botMessage={botMessage}
            onNewGame={handleNewGame}
            onUndo={handleUndo}
            onFlipBoard={handleFlipBoard}
            onGetHint={handleGetHint}
            onResign={handleResign}
            isThinking={isThinking}
            canUndo={moveHistory.length >= (isPassAndPlay ? 1 : 2)}
            onReview={handleReview}
            showHints={settings.showHints}
            canAnalyze={Boolean(user)}
            canReview={canReview}
            gameMode={gameMode}
            whitePlayerName={whitePlayerName}
            blackPlayerName={blackPlayerName}
            resignedColor={resignedColor}
          />

          {!isPassAndPlay && selectedBot?.isCoach && (
            <CoachingTip
              tip={coachingTip}
              isLoading={isCoachingLoading}
              onDismiss={() => setCoachingTip(null)}
            />
          )}
          <MoveHistory history={moveHistory} />
        </div>

        <AIDialogueDrawer
          message={botMessage}
          isOpen={isDialogueOpen}
          onToggle={() => setIsDialogueOpen((prev) => !prev)}
          onClose={() => setIsDialogueOpen(false)}
          isLoading={isThinking || isCoachingLoading}
          title={selectedBot?.name || 'AI'}
          avatar={selectedBot?.avatar || '🤖'}
        />

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
          color={pendingMove?.color || playerColor}
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
    </div>
  );
}

export default forwardRef(ChessGame);
