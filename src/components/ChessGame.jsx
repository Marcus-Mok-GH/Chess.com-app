import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ChessBoard from './ChessBoard';
import { Chess } from 'chess.js';
import { useSettings } from '../contexts/SettingsContext';
import { playSoundEffect } from '../utils/sound';
import { haptics } from '../utils/haptics';
import MoveHistory from './MoveHistory';
import GameControls from './GameControls';
import BotSelector from './BotSelector';
import PlayerBar from './PlayerBar';
import DebugPanel from './DebugPanel';
import AnimatedPiece from './AnimatedPiece';
import CoachingTip from './CoachingTip';
import AIDialogueDrawer from './AIDialogueDrawer';
import { BOTS, getRandomQuote, createCustomBot } from '../engine/bots/bots';
import { getCoachingFeedback, explainCoachMove } from '../engine/coach/coachAI';
import { generateGameId } from '../engine/game/gameId';
import { normalizeMoveHistory, toSanHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import StockfishWorker from '../engine/workers/stockfishWorker.js?worker';
import './ChessGame.css';

function findKingSquare(game, color) {
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'k' && piece.color === color) {
        return String.fromCharCode(97 + col) + (8 - row);
      }

    }
  }
  return null;
}

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
  const { user, isOnline } = useUser();
  const { settings } = useSettings();
  const isPassAndPlay = gameMode === 'pass';
  const passConfig = passAndPlayConfig || {};
  const whitePlayerName = (passConfig.whitePlayerName || 'White').trim() || 'White';
  const blackPlayerName = (passConfig.blackPlayerName || 'Black').trim() || 'Black';
  const autoFlipBoard = passConfig.autoFlipBoard ?? true;

  const PASS_AND_PLAY_BOT = useMemo(() => ({
    id: 'pass',
    name: 'Pass & Play',
    rating: 'Local',
    avatar: '🤝',
    color: '#5d9cec',
    personality: 'Two-player local match',
    isCoach: false,
  }), []);
  
  // Initialize state with error handling
  const [game, setGame] = useState(() => {
    try {
      return new Chess();
    } catch (error) {
      console.error('Failed to initialize chess game:', error);
      return null;
    }
  });
  
  const [boardOrientation, setBoardOrientation] = useState(initialBoardOrientation || 'white');
  const [playerColor, setPlayerColor] = useState(initialPlayerColor || 'w');
  const [selectedBot, setSelectedBot] = useState(() => {
    try {
      if (isPassAndPlay) {
        return PASS_AND_PLAY_BOT;
      }
      return (
        initialSelectedBot ||
        BOTS.find((b) => b.id === 'nelson') ||
        BOTS[0]
      );
    } catch (error) {
      console.error('Failed to initialize bot:', error);
      return PASS_AND_PLAY_BOT;
    }
  });
  const [customElo, setCustomElo] = useState(initialCustomElo ?? 1000);
  const [isThinking, setIsThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [botMessage, setBotMessage] = useState('');
  const [hintMove, setHintMove] = useState(null);
  const [isDialogueOpen, setIsDialogueOpen] = useState(false);
  const [gameId, setGameId] = useState(() => (initialGameId ? String(initialGameId).toUpperCase() : generateGameId()));
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const navigate = useNavigate();
  const [debugInfo, setDebugInfo] = useState(null);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [coachingTip, setCoachingTip] = useState(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [hasResigned, setHasResigned] = useState(false);
  const [resignedColor, setResignedColor] = useState(null);
  const [showVictory, setShowVictory] = useState(false);
  const gameRef = useRef(game);
  const selectedBotRef = useRef(selectedBot);
  const customEloRef = useRef(customElo);
  const settingsRef = useRef(settings);
  const moveHistoryRef = useRef(moveHistory);
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);

  const workerRef = useRef(null);
  const animationIdRef = useRef(0);
  const persistTimeoutRef = useRef(null);
  const suppressPersistRef = useRef(false);
  const boardWrapperRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Define getGameStatus early so it can be used in useEffect
  const getGameStatus = useMemo(() => {
    if (!game) return 'playing';
    if (hasResigned) return 'resigned';
    if (game.isCheckmate()) return 'checkmate';
    if (game.isStalemate()) return 'stalemate';
    if (game.isDraw()) return 'draw';
    if (game.inCheck()) return 'check';
    return 'playing';
  }, [game, hasResigned]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!botMessage) return;
    setIsDialogueOpen(true);
  }, [botMessage]);

  useEffect(() => () => {
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  useEffect(() => {
    if (!game) return;

    const isCheckmate = game.isCheckmate();
    const winner = isCheckmate ? (game.turn() === 'w' ? 'b' : 'w') : null;
    const didPlayerWin = isCheckmate && winner === playerColor;
    const shouldShowVictory = isPassAndPlay ? isCheckmate : didPlayerWin;

    if (!shouldShowVictory) {
      setShowVictory(false);
      return;
    }

    const victoryKey = `${game.fen()}-${winner}`;
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
    selectedBotRef.current = selectedBot;
  }, [selectedBot]);

  useEffect(() => {
    customEloRef.current = customElo;
  }, [customElo]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (hasLoadedPersistedState || !initialGameId) return;

    let isMounted = true;
    const loadState = async () => {
      try {
        // Load from database (requires user login)
        if (!user) {
          console.warn('[ChessGame] Cannot load game state without a user');
          return;
        }

        const match = await api.getLocalGameByCode(user.username, gameId);
        if (!match) {
          if (isMounted) {
            setHasLoadedPersistedState(true);
          }
          return;
        }

        const normalizedHistory = normalizeMoveHistory(match.move_history);

        if (!match?.fen) {
          if (isMounted) {
            setMoveHistory(normalizedHistory);
            setHasLoadedPersistedState(true);
          }
          return;
        }

        const restoredGame = buildGameFromHistory(normalizedHistory, match.fen);
        if (isMounted) {
          setGame(restoredGame);
          setMoveHistory(normalizedHistory);
          setHasLoadedPersistedState(true);
          console.log('[ChessGame] Loaded game state from database');
        }
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
  }, [gameId, hasLoadedPersistedState, initialGameId, user, isPassAndPlay]);

  // Initialize web worker
  useEffect(() => {
    workerRef.current = new StockfishWorker();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (moveHistory.length === 0 && selectedBot) {
      setBotMessage(getRandomQuote(selectedBot, 'start'));
    }
  }, [selectedBot, moveHistory.length, isPassAndPlay]);

  useEffect(() => {
    if (!onUiStateChange) return;
    const minUndoMoves = isPassAndPlay ? 1 : 2;
    onUiStateChange({
      isThinking,
      canUndo: moveHistory.length >= minUndoMoves,
      gameStatus: getGameStatus,
    });
  }, [isThinking, moveHistory.length, getGameStatus, onUiStateChange, isPassAndPlay]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (!initialGameId || !hasLoadedPersistedState || !game) return;
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false;
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(async () => {
      try {
        const gameResult = game.isCheckmate()
          ? (game.turn() === 'w' ? 'black' : 'white')
          : game.isDraw()
            ? 'draw'
            : 'in_progress';

        const bot = selectedBotRef.current;
        const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;
        const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;

        const storedHistory = toStoredMoveHistory(moveHistory);

        // Also save to database if online and user is logged in
        if (isOnline && user) {
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
            finalFen: game.fen(),
          });
          console.log('[ChessGame] Saved game state to database');
        }
      } catch (error) {
        console.error('[ChessGame] Failed to autosave game state:', error);
      }
    }, 500);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [boardOrientation, game, gameId, hasLoadedPersistedState, initialGameId, isOnline, moveHistory, playerColor, user, isPassAndPlay]);

  // Function to trigger piece animations
  const triggerAnimation = useCallback((moveData, gameCopy) => {
    const animations = [];
    
    // Handle castling - need to animate both king and rook
    if (moveData.flags && moveData.flags.includes('k')) {
      // Kingside castling
      const kingFrom = moveData.from;
      const kingTo = moveData.to;
      const rookFrom = moveData.color === 'w' ? 'h1' : 'h8';
      const rookTo = moveData.color === 'w' ? 'f1' : 'f8';
      
      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: kingFrom,
        toSquare: kingTo,
      });
      
      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else if (moveData.flags && moveData.flags.includes('q')) {
      // Queenside castling
      const kingFrom = moveData.from;
      const kingTo = moveData.to;
      const rookFrom = moveData.color === 'w' ? 'a1' : 'a8';
      const rookTo = moveData.color === 'w' ? 'd1' : 'd8';
      
      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: kingFrom,
        toSquare: kingTo,
      });
      
      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else {
      // Normal move
      animations.push({
        id: animationIdRef.current++,
        piece: { type: moveData.piece, color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });
      
      // If there's a capture, animate the captured piece disappearing
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
    
    setAnimatingPieces(prev => [...prev, ...animations]);
  }, []);

  const removeAnimation = useCallback((animationId) => {
    setAnimatingPieces(prev => prev.filter(anim => anim.id !== animationId));
  }, []);

  // Calculate captured pieces
  const capturedPieces = useMemo(() => {
    const initial = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    
    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          current[piece.color][piece.type]++;
        }
      }
    }

    const captured = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      for (const piece of ['q', 'r', 'b', 'n', 'p']) {
        const diff = initial[color][piece] - current[color][piece];
        for (let i = 0; i < diff; i++) {
          captured[color].push(piece);
        }
      }
    }
    return captured;
  }, [game]);

  const makeAIMove = useCallback(() => {
    if (isPassAndPlay) return;
    if (gameRef.current.isGameOver() || !workerRef.current || isThinking) return;

    setIsThinking(true);

    // Get the actual bot config (may be custom bot with ELO)
    let bot = selectedBotRef.current;
    if (bot.id === 'custom') {
      bot = createCustomBot(customEloRef.current);
    }

    const fen = gameRef.current.fen();

    // Show thinking message
    setBotMessage(getRandomQuote(bot, 'thinking'));

    // Define message handler to avoid multiple handlers
    const handleMessage = (e) => {
      const { type, bestMove, debugInfo: newDebugInfo } = e.data;

      // Handle progress updates
      if (type === 'progress' && newDebugInfo && settingsRef.current.debugMode) {
        setDebugInfo(newDebugInfo);
        return;
      }

      // Handle final result
      if (type === 'result') {
        // Remove the event listener to prevent multiple calls
        workerRef.current.removeEventListener('message', handleMessage);

        if (newDebugInfo && settingsRef.current.debugMode) {
          setDebugInfo(newDebugInfo);
        }

        if (bestMove) {
          const history = Array.isArray(moveHistoryRef.current) ? moveHistoryRef.current : [];
          const newGame = buildGameFromHistory(history, fen);
          const moveResult = newGame.move(bestMove);

          // Trigger animation before updating state
          triggerAnimation(moveResult, newGame);

          // Delay state update to allow animation to start
          setTimeout(() => {
            setGame(newGame);
            if (moveResult) {
              setMoveHistory([...history, moveResult]);
            }

            if (moveResult) {
              triggerMoveHaptics(moveResult, newGame);
            }

            if (newGame.isCheckmate()) {
              setBotMessage(getRandomQuote(bot, 'win'));
            } else if (newGame.isDraw()) {
              setBotMessage(getRandomQuote(bot, 'draw'));
            } else if (newGame.inCheck()) {
              setBotMessage(getRandomQuote(bot, 'check'));
            } else if (moveResult.captured) {
              setBotMessage(getRandomQuote(bot, 'capture'));
            } else if (Math.random() < 0.15) {
              const categories = ['thinking', 'blunder', 'goodMove'];
              setBotMessage(getRandomQuote(bot, categories[Math.floor(Math.random() * categories.length)]));
            }
          }, 50);
        }

        setIsThinking(false);
      }
    };

    // Add the event listener
    workerRef.current.addEventListener('message', handleMessage);

    // Send work to the worker - pass full bot config for Stockfish
    workerRef.current.postMessage({
      fen,
      bot: {
        name: bot.name,
        depth: bot.depth,
        nodes: bot.nodes,
        blunderChance: bot.blunderChance,
        missedTacticsChance: bot.missedTacticsChance,
        playStyle: bot.playStyle,
      },
      debug: settingsRef.current.debugMode,
    });
  }, [triggerAnimation, isThinking, isPassAndPlay, triggerMoveHaptics]);

  useEffect(() => {
    if (isPassAndPlay) return;
    if (game.turn() !== playerColor && !game.isGameOver() && !isThinking) {
      const timer = setTimeout(() => {
        // Double-check conditions before making AI move
        if (gameRef.current.turn() !== playerColor && !gameRef.current.isGameOver() && !isThinking) {
          makeAIMove();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [game, playerColor, isThinking, makeAIMove, isPassAndPlay]);

  useEffect(() => {
    if (!isPassAndPlay || !autoFlipBoard || !game) return;
    const nextOrientation = game.turn() === 'w' ? 'white' : 'black';
    setBoardOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));
  }, [game, isPassAndPlay, autoFlipBoard]);

  const saveGameToDatabase = useCallback(async (reason, winner) => {
    if (isPassAndPlay) return;
    if (!isOnline || !user) return; // Only save if online and logged in

    try {
      let result;
      if (reason === 'resigned') {
        result = winner;
      } else if (game.isCheckmate()) {
        result = game.turn() === 'w' ? 'black' : 'white';
      } else if (game.isDraw()) {
        result = 'draw';
      } else {
        result = 'unknown';
      }

      // Get bot info
      const bot = selectedBotRef.current;
      const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;
      const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;

      const storedHistory = toStoredMoveHistory(moveHistory);

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
        finalFen: game.fen(),
      });
      
      console.log('✅ Game saved to database');
    } catch (error) {
      console.error('🔴 Failed to save game:', error);
    }
  }, [game, gameId, moveHistory, isOnline, user, playerColor, isPassAndPlay]);

  // Save game to database when it ends
  useEffect(() => {
    if (getGameStatus !== 'playing' && !hasResigned && moveHistory.length > 0) {
      let result;
      if (game.isCheckmate()) {
        result = game.turn() === 'w' ? 'black' : 'white';
      } else if (game.isDraw()) {
        result = 'draw';
      } else {
        result = 'unknown';
      }
      saveGameToDatabase('game_end', result);
    }
  }, [getGameStatus, hasResigned, moveHistory.length, game, saveGameToDatabase]);

  // Get coaching feedback after player move (only for Coach bot)
  const requestCoachingFeedback = useCallback(async (fenBefore, move, history) => {
    if (isPassAndPlay || !selectedBotRef.current.isCoach) return;
    
    setIsCoachingLoading(true);
    setBotMessage('Analyzing your move...');
    try {
      const feedback = await getCoachingFeedback(fenBefore, move, toSanHistory(history), (streamedText) => {
        setBotMessage(streamedText);
      });
      if (feedback) {
        setBotMessage(feedback);
        setCoachingTip(feedback);
      }
    } catch (error) {
      console.error('[ChessGame] Coaching feedback error:', error);
      setBotMessage('Analysis unavailable');
    } finally {
      setIsCoachingLoading(false);
    }
  }, [isPassAndPlay]);

  const resolvePromotion = useCallback((from, to, pieceType) => {
    const isPawn = pieceType === 'p';
    if (!isPawn) return null;

    const promotionRank = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');
    if (!promotionRank) return null;

    if (settingsRef.current.autoQueen) {
      return 'q';
    }

    const selection = window.prompt('Promote to (q, r, b, n):', 'q');
    const choice = (selection || 'q').toLowerCase();
    if (['q', 'r', 'b', 'n'].includes(choice)) {
      return choice;
    }
    return 'q';
  }, []);

  const triggerMoveHaptics = useCallback((moveData, nextGame) => {
    if (!moveData || !nextGame) return;

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
  }, [playerColor, isPassAndPlay]);

  const onSquareClick = useCallback(
    (square) => {
      const activeColor = game.turn();
      if ((!isPassAndPlay && activeColor !== playerColor) || isThinking || game.isGameOver()) return;

      const piece = game.get(square);

      if (selectedSquare) {
        // If clicking the same square, deselect it
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }

        const promotion = resolvePromotion(selectedSquare, square, game.get(selectedSquare)?.type);
        if (settingsRef.current.confirmMoves) {
          const proceed = window.confirm('Make this move?');
          if (!proceed) {
            setSelectedSquare(null);
            setPossibleMoves([]);
            return;
          }
        }

        const moveAttempt = {
          from: selectedSquare,
          to: square,
          promotion: promotion || 'q',
        };

        const gameCopy = buildGameFromHistory(moveHistory, game.fen());
        const move = gameCopy.move(moveAttempt);

        if (move) {
          const fenBefore = game.fen();
          // Trigger animation before updating state
          triggerAnimation(move, gameCopy);

          // Delay state update to allow animation to start
          setTimeout(() => {
            setGame(gameCopy);
            const nextHistory = [...moveHistory, move];
            setMoveHistory(nextHistory);
            setSelectedSquare(null);
            setPossibleMoves([]);

            if (!isPassAndPlay) {
              const bot = selectedBotRef.current;
              if (gameCopy.isCheckmate()) {
                setBotMessage(getRandomQuote(bot, 'lose'));
              } else if (gameCopy.isDraw()) {
                setBotMessage(getRandomQuote(bot, 'draw'));
              } else if (move.captured) {
                setBotMessage(getRandomQuote(bot, 'capture'));
              } else if (Math.random() < 0.2) {
                setBotMessage(getRandomQuote(bot, 'goodMove'));
              }
            }

            if (move.captured) {
              playSoundEffect(settingsRef.current, { type: 'capture' });
            } else {
              playSoundEffect(settingsRef.current, { type: 'move' });
            }

            if (gameCopy.inCheck()) {
              playSoundEffect(settingsRef.current, { type: 'check' });
            }

            triggerMoveHaptics(move, gameCopy);

            // Request coaching feedback for Coach bot
            requestCoachingFeedback(fenBefore, move.san, nextHistory);
          }, 50);
          return;
        }
      }

      const selectableColor = isPassAndPlay ? activeColor : playerColor;
      if (piece && piece.color === selectableColor) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    },
    [game, playerColor, selectedSquare, isThinking, triggerAnimation, requestCoachingFeedback, resolvePromotion, moveHistory, isPassAndPlay, triggerMoveHaptics]
  );

  const onPieceDrop = useCallback(
    (sourceSquare, targetSquare) => {
      if ((!isPassAndPlay && game.turn() !== playerColor) || isThinking || game.isGameOver()) {
        return false;
      }

      const fenBefore = game.fen();
      const gameCopy = buildGameFromHistory(moveHistory, fenBefore);
      const promotion = resolvePromotion(sourceSquare, targetSquare, game.get(sourceSquare)?.type);
      if (settingsRef.current.confirmMoves) {
        const proceed = window.confirm('Make this move?');
        if (!proceed) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return false;
        }
      }

      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: promotion || 'q',
      });

      if (move === null) return false;

      // Trigger animation before updating state
      triggerAnimation(move, gameCopy);

      // Delay state update to allow animation to start
      setTimeout(() => {
        setGame(gameCopy);
        const nextHistory = [...moveHistory, move];
        setMoveHistory(nextHistory);
        setSelectedSquare(null);
        setPossibleMoves([]);

        if (!isPassAndPlay) {
          const bot = selectedBotRef.current;
          if (gameCopy.isCheckmate()) {
            setBotMessage(getRandomQuote(bot, 'lose'));
          } else if (gameCopy.isDraw()) {
            setBotMessage(getRandomQuote(bot, 'draw'));
          } else if (move.captured) {
            setBotMessage(getRandomQuote(bot, 'capture'));
          } else if (Math.random() < 0.2) {
            setBotMessage(getRandomQuote(bot, 'goodMove'));
          }
        }

        if (move.captured) {
          playSoundEffect(settingsRef.current, { type: 'capture' });
        } else {
          playSoundEffect(settingsRef.current, { type: 'move' });
        }

        if (gameCopy.inCheck()) {
          playSoundEffect(settingsRef.current, { type: 'check' });
        }

        triggerMoveHaptics(move, gameCopy);

        // Request coaching feedback for Coach bot
        requestCoachingFeedback(fenBefore, move.san, nextHistory);
      }, 50);

      return true;
    },
    [game, playerColor, isThinking, triggerAnimation, requestCoachingFeedback, resolvePromotion, moveHistory, isPassAndPlay, triggerMoveHaptics]
  );

  const handleNewGame = useCallback(() => {
    const newId = generateGameId();
    suppressPersistRef.current = true;
    setGameId(newId);
    const newGame = new Chess();
    setGame(newGame);
    setMoveHistory([]);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setIsThinking(false);
    if (!isPassAndPlay) {
      setBotMessage(getRandomQuote(selectedBot, 'start'));
    } else {
      setBotMessage('');
    }
    setCoachingTip(null);
    setHasResigned(false);
    setResignedColor(null);
    setHasLoadedPersistedState(true);
  }, [gameId, selectedBot, isPassAndPlay]);

  const handleResign = useCallback(() => {
    if (hasResigned || game.isGameOver()) return;
    const resigningColor = isPassAndPlay ? game.turn() : playerColor;
    const winnerColor = resigningColor === 'w' ? 'black' : 'white';
    haptics.lose();
    setHasResigned(true);
    setResignedColor(resigningColor);
    setSelectedSquare(null);
    setPossibleMoves([]);
    if (!isPassAndPlay) {
      setBotMessage(getRandomQuote(selectedBot, 'win'));
    } else {
      setBotMessage('');
    }
    // Save game to database
    saveGameToDatabase('resigned', winnerColor);
  }, [hasResigned, game, selectedBot, saveGameToDatabase, playerColor, isPassAndPlay]);

  const handleUndo = useCallback(() => {
    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    const undoCount = isPassAndPlay ? 1 : 2;
    for (let i = 0; i < undoCount; i++) {
      gameCopy.undo();
    }
    setGame(gameCopy);
    setMoveHistory(gameCopy.history({ verbose: true }));
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [game, moveHistory, isPassAndPlay]);

  const handleFlipBoard = useCallback(() => {
    const newOrientation = boardOrientation === 'white' ? 'black' : 'white';
    setBoardOrientation(newOrientation);
    if (!isPassAndPlay) {
      // When board is oriented for white, player plays white (at bottom)
      // When board is oriented for black, player plays black (at bottom)
      setPlayerColor(newOrientation === 'white' ? 'w' : 'b');
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

  const handleGetHint = useCallback(() => {
    if (!settingsRef.current.showHints) return;
    if (!workerRef.current || game.isGameOver() || isThinking) return;
    
    setHintMove(null);
    const worker = workerRef.current;
    
    const handleMessage = (e) => {
      if (e.data.type === 'result' && e.data.bestMove) {
        const move = e.data.bestMove;
        setHintMove({ from: move.substring(0, 2), to: move.substring(2, 4) });
        worker.removeEventListener('message', handleMessage);
        setTimeout(() => setHintMove(null), 3000);
      }
    };
    
    worker.addEventListener('message', handleMessage);
    
    // Use a fast but decent configuration for quick hints
    // depth: 8 and nodes: 5000 gives good moves in ~200-500ms
    worker.postMessage({
      fen: game.fen(),
      bot: { name: 'Hint', depth: 8, nodes: 5000 },
      debug: false,
    });
  }, [game, isThinking]);

  const handleReview = useCallback(() => {
    navigate(`/analysis/${gameId}`, { state: { moveHistory } });
  }, [navigate, gameId, moveHistory]);

  useImperativeHandle(
    ref,
    () => ({
      newGame: handleNewGame,
      undo: handleUndo,
      flipBoard: handleFlipBoard,
      hint: handleGetHint,
      resign: handleResign,
      review: handleReview,
      getStatus: () => getGameStatus,
    }),
    [handleNewGame, handleUndo, handleFlipBoard, handleGetHint, handleResign, handleReview, getGameStatus],
  );

  // Mobile swipe gestures on board wrapper
  useEffect(() => {
    const element = boardWrapperRef.current;
    if (!element) return;

    const SWIPE_THRESHOLD = 60;
    const SWIPE_TIMEOUT = 300;
    const RESTRAINT = 100;

    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e) => {
      const touch = e.changedTouches[0];
      const distX = touch.clientX - touchStartRef.current.x;
      const distY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      // Check if valid horizontal swipe
      if (elapsed <= SWIPE_TIMEOUT && Math.abs(distX) >= SWIPE_THRESHOLD && Math.abs(distY) <= RESTRAINT) {
        if (distX > 0) {
          // Swipe right - undo move
          const minMoves = isPassAndPlay ? 1 : 2;
          if (moveHistoryRef.current.length >= minMoves && !isThinking) {
            haptics.swipe();
            handleUndo();
          }
        } else {
          // Swipe left - flip board
          haptics.swipe();
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
  }, [handleUndo, handleFlipBoard, isThinking, isPassAndPlay]);

  // Safety check - if game failed to initialize, show error
  if (!game) {
    return (
      <div className="chess-game-error">
        <div className="error-message">
          <h2>⚠️ Game Initialization Error</h2>
          <p>Failed to initialize the chess game. Please refresh the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  const customSquareStyles = {};

  if (settings.highlightMoves) {
    if (selectedSquare) {
      customSquareStyles[selectedSquare] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
      };
    }

    possibleMoves.forEach((square) => {
      const piece = game.get(square);
      customSquareStyles[square] = {
        background: piece
          ? 'radial-gradient(circle, rgba(255, 0, 0, 0.4) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
  }

  if (game.inCheck()) {
    const kingSquare = findKingSquare(game, game.turn());
    if (kingSquare) {
      customSquareStyles[kingSquare] = {
        backgroundColor: 'rgba(255, 0, 0, 0.5)',
      };
    }
  }

  if (hintMove && settings.showHints) {
    customSquareStyles[hintMove.from] = {
      backgroundColor: 'rgba(0, 255, 0, 0.5)',
    };
    customSquareStyles[hintMove.to] = {
      backgroundColor: 'rgba(0, 255, 0, 0.5)',
    };
  }

  const botPlayer = { 
    name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name, 
    avatar: selectedBot?.avatar, 
    rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating, 
    isBot: true, 
    color: 'b', 
    botColor: selectedBot?.color, 
    isCoach: selectedBot?.isCoach 
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

  const canReview = getGameStatus === 'checkmate' || getGameStatus === 'resigned';
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
              gameStatus={getGameStatus}
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

            {!isPassAndPlay && selectedBot.isCoach && (
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
            onClose={() => {
              setIsDialogueOpen(false);
            }}
            isLoading={isThinking || isCoachingLoading}
            title={selectedBot?.name || 'AI'}
            avatar={selectedBot?.avatar || '🤖'}
          />
      </div>

    </div>
  );
}

export default forwardRef(ChessGame);
