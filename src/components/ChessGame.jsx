import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ChessBoard from './ChessBoard';
import { Chess } from 'chess.js';
import { useSettings } from '../contexts/SettingsContext';
import { playSoundEffect } from '../utils/sound';
import MoveHistory from './MoveHistory';
import GameControls from './GameControls';
import BotSelector from './BotSelector';
import PlayerBar from './PlayerBar';
import DebugPanel from './DebugPanel';
import AnimatedPiece from './AnimatedPiece';
import CoachingTip from './CoachingTip';
import { BOTS, getRandomQuote, createCustomBot } from '../engine/bots/bots';
import { getCoachingFeedback, explainCoachMove } from '../engine/coach/coachAI';
import { generateGameId } from '../engine/game/gameId';
import { normalizeMoveHistory, toSanHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import StockfishWorker from '../engine/workers/stockfishWorker.js?worker';
import './ChessGame.css';

const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

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

function parseEngineMove(move) {
  if (!move || typeof move !== 'string') return move;
  const trimmed = move.trim();
  if (UCI_MOVE_REGEX.test(trimmed)) {
    return {
      from: trimmed.slice(0, 2),
      to: trimmed.slice(2, 4),
      promotion: trimmed.length > 4 ? trimmed[4].toLowerCase() : undefined,
    };
  }
  return trimmed;
}

function applyEngineMove(gameInstance, move) {
  if (!gameInstance || !move) return null;
  const parsed = parseEngineMove(move);
  if (typeof parsed === 'string') {
    return gameInstance.move(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    const moveObj = {
      from: parsed.from,
      to: parsed.to,
      ...(parsed.promotion ? { promotion: parsed.promotion } : {}),
    };
    return gameInstance.move(moveObj);
  }
  return null;
}

function getMoveCoords(gameInstance, move) {
  const parsed = parseEngineMove(move);
  if (parsed && typeof parsed === 'object') {
    return { from: parsed.from, to: parsed.to };
  }
  if (typeof parsed === 'string') {
    const tempGame = new Chess(gameInstance.fen());
    const applied = tempGame.move(parsed);
    if (applied) {
      return { from: applied.from, to: applied.to };
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
    onUiStateChange,
    initialGameId,
  },
  ref,
) {
  const { user, isOnline } = useUser();
  const { settings } = useSettings();
  
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
      return (
        initialSelectedBot ||
        BOTS.find((b) => b.id === 'nelson') ||
        BOTS[0]
      );
    } catch (error) {
      console.error('Failed to initialize bot:', error);
      return null;
    }
  });
  const [customElo, setCustomElo] = useState(initialCustomElo ?? 1000);
  const [isThinking, setIsThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [botMessage, setBotMessage] = useState('');
  const [hintMove, setHintMove] = useState(null);
  const [gameId, setGameId] = useState(() => (initialGameId ? String(initialGameId).toUpperCase() : generateGameId()));
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false);
  const navigate = useNavigate();
  const [debugInfo, setDebugInfo] = useState(null);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [coachingTip, setCoachingTip] = useState(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [hasResigned, setHasResigned] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const gameRef = useRef(game);
  const selectedBotRef = useRef(selectedBot);
  const customEloRef = useRef(customElo);
  const settingsRef = useRef(settings);
  const moveHistoryRef = useRef(moveHistory);
  const isThinkingRef = useRef(isThinking); // Add ref to track isThinking state
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);

  const workerRef = useRef(null);

  const animationIdRef = useRef(0);
  const persistTimeoutRef = useRef(null);
  const suppressPersistRef = useRef(false);

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
    isThinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    if (!game) return;

    const isCheckmate = game.isCheckmate();
    const winner = isCheckmate ? (game.turn() === 'w' ? 'b' : 'w') : null;
    const didPlayerWin = isCheckmate && winner === playerColor;

    if (!didPlayerWin) {
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
  }, [game, playerColor]);

  useEffect(() => {
    selectedBotRef.current = selectedBot;
  }, [selectedBot]);

  useEffect(() => {
    customEloRef.current = customElo;
  }, [customElo]);

  useEffect(() => {
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
  }, [gameId, hasLoadedPersistedState, initialGameId, user]);

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
    if (moveHistory.length === 0 && selectedBot) {
      setBotMessage(getRandomQuote(selectedBot, 'start'));
    }
  }, [selectedBot, moveHistory.length]);

  useEffect(() => {
    if (!onUiStateChange) return;
    onUiStateChange({
      isThinking,
      canUndo: moveHistory.length >= 2,
      gameStatus: getGameStatus,
      botMessage,
      selectedBot,
    });
  }, [isThinking, moveHistory.length, getGameStatus, onUiStateChange, botMessage, selectedBot]);

  useEffect(() => {
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
  }, [boardOrientation, game, gameId, hasLoadedPersistedState, initialGameId, isOnline, moveHistory, playerColor, user]);

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
    if (gameRef.current.isGameOver() || !workerRef.current || isThinkingRef.current) return;

    setIsThinking(true);

    // Update the ref immediately to reflect the new state
    isThinkingRef.current = true;

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
          const moveResult = applyEngineMove(newGame, bestMove);
          if (!moveResult) {
            console.warn('[ChessGame] Engine move could not be applied:', bestMove);
            setIsThinking(false);
            isThinkingRef.current = false;
            return;
          }

          // Trigger animation before updating state
          triggerAnimation(moveResult, newGame);

          // Delay state update to allow animation to start
          setTimeout(() => {
            setGame(newGame);
            setMoveHistory([...history, moveResult]);

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
        isThinkingRef.current = false;
      }
    };

    // Remove any existing listeners to prevent duplicates
    workerRef.current.removeEventListener('message', handleMessage);
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
  }, [triggerAnimation]);

  useEffect(() => {
    if (game.turn() !== playerColor && !game.isGameOver() && !isThinking) {
      const timer = setTimeout(() => {
        // Double-check conditions before making AI move using ref values for most current state
        if (gameRef.current.turn() !== playerColor && !gameRef.current.isGameOver() && !isThinkingRef.current) {
          makeAIMove();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [game, playerColor, isThinking, makeAIMove]);

  const saveGameToDatabase = useCallback(async (reason, winner) => {
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
  }, [game, gameId, moveHistory, isOnline, user, playerColor]);

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
    if (!selectedBotRef.current.isCoach) return;
    
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
  }, []);

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

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== playerColor || isThinking || game.isGameOver()) return;

      const piece = game.get(square);

      if (selectedSquare) {
        // If clicking the same square, deselect it
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }

        const promotion = resolvePromotion(selectedSquare, square, game.get(selectedSquare)?.type);
        if (promotion === null && game.get(selectedSquare)?.type === 'p' && settingsRef.current.confirmMoves) {
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

            if (move.captured) {
              playSoundEffect(settingsRef.current, { type: 'capture' });
            } else {
              playSoundEffect(settingsRef.current, { type: 'move' });
            }

            if (gameCopy.inCheck()) {
              playSoundEffect(settingsRef.current, { type: 'check' });
            }

            // Request coaching feedback for Coach bot
            requestCoachingFeedback(fenBefore, move.san, nextHistory);
          }, 50);
          return;
        }
      }

      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    },
    [game, playerColor, selectedSquare, isThinking, triggerAnimation, requestCoachingFeedback, resolvePromotion, moveHistory]
  );

  const onPieceDrop = useCallback(
    (sourceSquare, targetSquare) => {
      if (game.turn() !== playerColor || isThinking || game.isGameOver()) {
        return false;
      }

      const fenBefore = game.fen();
      const gameCopy = buildGameFromHistory(moveHistory, fenBefore);
      const promotion = resolvePromotion(sourceSquare, targetSquare, game.get(sourceSquare)?.type);
      if (promotion === null && game.get(sourceSquare)?.type === 'p' && settingsRef.current.confirmMoves) {
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

        if (move.captured) {
          playSoundEffect(settingsRef.current, { type: 'capture' });
        } else {
          playSoundEffect(settingsRef.current, { type: 'move' });
        }

        if (gameCopy.inCheck()) {
          playSoundEffect(settingsRef.current, { type: 'check' });
        }

        // Request coaching feedback for Coach bot
        requestCoachingFeedback(fenBefore, move.san, nextHistory);
      }, 50);

      return true;
    },
    [game, playerColor, isThinking, triggerAnimation, requestCoachingFeedback, resolvePromotion, moveHistory]
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
    setBotMessage(getRandomQuote(selectedBot, 'start'));
    setCoachingTip(null);
    setHasResigned(false);
    setHasLoadedPersistedState(true);
  }, [gameId, selectedBot]);

  const handleResign = useCallback(() => {
    if (hasResigned || game.isGameOver()) return;
    setHasResigned(true);
    setBotMessage(getRandomQuote(selectedBot, 'win'));
    // Save game to database
    saveGameToDatabase('resigned', selectedBot.name === 'You' ? 'black' : 'white');
  }, [hasResigned, game, selectedBot, saveGameToDatabase]);

  const handleUndo = useCallback(() => {
    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    gameCopy.undo();
    gameCopy.undo();
    setGame(gameCopy);
    setMoveHistory(gameCopy.history({ verbose: true }));
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [game, moveHistory]);

  const handleFlipBoard = useCallback(() => {
    const newOrientation = boardOrientation === 'white' ? 'black' : 'white';
    setBoardOrientation(newOrientation);
    // When board is oriented for white, player plays white (at bottom)
    // When board is oriented for black, player plays black (at bottom)
    setPlayerColor(newOrientation === 'white' ? 'w' : 'b');
  }, [boardOrientation]);

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
    setBotMessage(getRandomQuote(bot, 'start'));
  }, []);

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
        const coords = getMoveCoords(game, move);
        if (coords) {
          setHintMove({ from: coords.from, to: coords.to });
          setTimeout(() => setHintMove(null), 3000);
        }
        worker.removeEventListener('message', handleMessage);
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

  const topPlayer = boardOrientation === 'white' 
    ? { name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name, avatar: selectedBot?.avatar, rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating, isBot: true, color: 'b', botColor: selectedBot?.color, isCoach: selectedBot?.isCoach }
    : { name: 'You', avatar: '👤', rating: '???', isBot: false, color: 'w', isCoach: false };
  
  const bottomPlayer = boardOrientation === 'white'
    ? { name: 'You', avatar: '👤', rating: '???', isBot: false, color: 'w', isCoach: false }
    : { name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name, avatar: selectedBot?.avatar, rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating, isBot: true, color: 'b', botColor: selectedBot?.color, isCoach: selectedBot?.isCoach };

  const canReview = getGameStatus === 'checkmate' || getGameStatus === 'resigned';

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
            <div className="board-wrapper">
              <ChessBoard
                position={game}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardOrientation={boardOrientation}
                customSquareStyles={customSquareStyles}
                showCoordinates={settings.showCoordinates}
                boardTheme={settings.boardTheme}
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
              botMessage={bottomPlayer.isBot ? botMessage : null}
            />
            {settings.debugMode && (
              <DebugPanel debugInfo={debugInfo} isThinking={isThinking} />
            )}
          </div>

          <div className="sidebar">
            <div className="sidebar-header">
              <span className="game-id-label" title="Game ID">Game {gameId}</span>
            </div>
            <BotSelector
              selectedBot={selectedBot}
              onSelectBot={handleSelectBot}
              disabled={isThinking}
              customElo={customElo}
              onCustomEloChange={handleCustomEloChange}
            />
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
              canUndo={moveHistory.length >= 2}
              onReview={handleReview}
              showHints={settings.showHints}
              canAnalyze={Boolean(user)}
              canReview={canReview}
            />

            {selectedBot.isCoach && (
              <CoachingTip
                tip={coachingTip}
                isLoading={isCoachingLoading}
                onDismiss={() => setCoachingTip(null)}
              />
            )}
            <MoveHistory history={moveHistory} />
          </div>
      </div>

    </div>
  );
}

export default forwardRef(ChessGame);
