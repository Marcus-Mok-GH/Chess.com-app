import haptics from '../utils/haptics';
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
import { getCoachingFeedback } from '../engine/coach/coachAI';
import { generateGameId } from '../engine/game/gameId';
import { normalizeMoveHistory, toSanHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';

import { findKingSquare, applyEngineMove, getMoveCoords } from './ChessGame/utils';
import { useCapturedPieces, usePieceAnimations } from './ChessGame/hooks';
import GameStatus from './ChessGame/subcomponents/GameStatus';
import './ChessGame.css';

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
  const [coachingTip, setCoachingTip] = useState(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [hasResigned, setHasResigned] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const gameRef = useRef(game);
  const selectedBotRef = useRef(selectedBot);
  const customEloRef = useRef(customElo);
  const settingsRef = useRef(settings);
  const moveHistoryRef = useRef(moveHistory);
  const isThinkingRef = useRef(isThinking); // Add ref to track isThinking state
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);

  const engineErrorRef = useRef(false);
  const busyRetryCountRef = useRef(0);

  const persistTimeoutRef = useRef(null);
  const suppressPersistRef = useRef(false);

  const { animatingPieces, triggerAnimation, removeAnimation } = usePieceAnimations();
  const capturedPieces = useCapturedPieces(game);

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


  useEffect(() => {
    if (moveHistory.length === 0 && selectedBot) {
      setBotMessage(getRandomQuote(selectedBot, 'start'));
    }
  }, [selectedBot, moveHistory.length]);

  useEffect(() => {
    if (!onUiStateChange) return;
    onUiStateChange({
      isThinking,
      canUndo: moveHistory.length >= 2,\n      gameStatus: getGameStatus,\n      botMessage,\n      selectedBot,\n    });\n  }, [isThinking, moveHistory.length, getGameStatus, onUiStateChange, botMessage, selectedBot]);\n\n  useEffect(() => {\n    if (!initialGameId || !hasLoadedPersistedState || !game) return;\n    if (suppressPersistRef.current) {\n      suppressPersistRef.current = false;\n      return;\n    }\n\n    if (persistTimeoutRef.current) {\n      clearTimeout(persistTimeoutRef.current);\n    }\n\n    persistTimeoutRef.current = setTimeout(async () => {\n      try {\n        const gameResult = game.isCheckmate()\n          ? (game.turn() === 'w' ? 'black' : 'white')\n          : game.isDraw()\n            ? 'draw'\n            : 'in_progress';\n\n        const bot = selectedBotRef.current;\n        const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;\n        const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;\n\n        const storedHistory = toStoredMoveHistory(moveHistory);\n\n        // Also save to database if online and user is logged in\n        if (isOnline && user) {\n          await api.saveGame({\n            gameCode: gameId,\n            moveHistory: storedHistory,\n            result: gameResult,\n            gameMode: 'local',\n            userId: user.id,\n            username: user.username,\n            opponentName: botName,\n            opponentElo: botElo,\n            playerColor: playerColor === 'w' ? 'white' : 'black',\n            finalFen: game.fen(),\n          });\n          console.log('[ChessGame] Saved game state to database');\n        }\n      } catch (error) {\n        console.error('[ChessGame] Failed to autosave game state:', error);\n      }\n    }, 500);\n\n    return () => {\n      if (persistTimeoutRef.current) {\n        clearTimeout(persistTimeoutRef.current);\n      }\n    };\n  }, [boardOrientation, game, gameId, hasLoadedPersistedState, initialGameId, isOnline, moveHistory, playerColor, user]);\n\n  const makeAIMove = useCallback(async () => {\n    if (gameRef.current.isGameOver() || isThinkingRef.current || engineErrorRef.current) return;\n\n    setIsThinking(true);\n    isThinkingRef.current = true;\n\n    let bot = selectedBotRef.current;\n    if (bot.id === 'custom') {\n      bot = createCustomBot(customEloRef.current);\n    }\n\n    const fen = gameRef.current.fen();\n    if (!bot.isCoach) setBotMessage(getRandomQuote(bot, 'thinking'));\n\n    try {\n      const response = await api.getEngineMove({\n        fen,\n        bot: {\n          name: bot.name,\n          depth: bot.depth,\n          nodes: bot.nodes,\n          blunderChance: bot.blunderChance,\n          missedTacticsChance: bot.missedTacticsChance,\n          playStyle: bot.playStyle,\n        },\n        debug: settingsRef.current.debugMode,\n      });\n\n      const { bestMove, debugInfo: newDebugInfo } = response;\n\n      // Successful response — reset consecutive-failure counter so future isolated\n      // timeouts don't accumulate toward the permanent-block threshold.\n      busyRetryCountRef.current = 0;\n      setEngineError(null);\n\n      if (newDebugInfo && settingsRef.current.debugMode) {\n        setDebugInfo(newDebugInfo);\n      }\n\n      if (bestMove) {\n        const history = Array.isArray(moveHistoryRef.current) ? moveHistoryRef.current : [];\n        const newGame = buildGameFromHistory(history, fen);\n        const moveResult = applyEngineMove(newGame, bestMove);\n\n        if (!moveResult) {\n          console.warn('[ChessGame] Engine move could not be applied:', bestMove);\n          setIsThinking(false);\n          isThinkingRef.current = false;\n          // Don't show error to user, just stop thinking\n          return;\n        }\n\n        \n\n        setTimeout(() => {\n          if (moveResult.captured) haptics.capture(); else haptics.move();\n          setGame(newGame);\n          setMoveHistory([...history, moveResult]);\n\n          if (!bot.isCoach) {\n            if (newGame.isCheckmate()) {\n              setBotMessage(getRandomQuote(bot, "win"));\n            } else if (newGame.isDraw()) {\n              setBotMessage(getRandomQuote(bot, "draw"));\n            } else if (newGame.inCheck()) {\n              setBotMessage(getRandomQuote(bot, "check"));\n            } else if (moveResult.captured) {\n              setBotMessage(getRandomQuote(bot, "capture"));\n            } else if (Math.random() < 0.15) {\n              const categories = ["thinking", "blunder", "goodMove"];\n              setBotMessage(getRandomQuote(bot, categories[Math.floor(Math.random() * categories.length)]));\n            }\n          }\n        }, 50);\n      }\n    } catch (err) {\n      console.error('[ChessGame] Engine error:', err);\n      busyRetryCountRef.current = (busyRetryCountRef.current || 0) + 1;\n      // Only permanently block after 3 consecutive failures to allow recovery from\n      // transient serverless cold-start timeouts without silencing the bot forever.\n      if (busyRetryCountRef.current >= 3) {\n        engineErrorRef.current = true;\n        setEngineError(err.message || 'Failed to connect to chess engine');\n      } else {\n        setEngineError(`Engine error (attempt ${busyRetryCountRef.current}/3): ${err.message}`);\n      }\n    } finally {\n      setIsThinking(false);\n      isThinkingRef.current = false;\n    }\n  }, [triggerAnimation]);\n\n  useEffect(() => {\n    if (game.turn() !== playerColor && !game.isGameOver() && !isThinking) {\n      const timer = setTimeout(() => {\n        // Double-check conditions before making AI move using ref values for most current state\n        if (gameRef.current.turn() !== playerColor && !gameRef.current.isGameOver() && !isThinkingRef.current) {\n          makeAIMove();\n        }\n      }, 50);\n      return () => clearTimeout(timer);\n    }\n  }, [game, playerColor, isThinking, makeAIMove]);\n\n  const saveGameToDatabase = useCallback(async (reason, winner) => {\n    if (!isOnline || !user) return; // Only save if online and logged in\n\n    try {\n      let result;\n      if (reason === 'resigned') {\n        result = winner;\n      } else if (game.isCheckmate()) {\n        result = game.turn() === 'w' ? 'black' : 'white';\n      } else if (game.isDraw()) {\n        result = 'draw';\n      } else {\n        result = 'unknown';\n      }\n\n      // Get bot info\n      const bot = selectedBotRef.current;\n      const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;\n      const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;\n\n      const storedHistory = toStoredMoveHistory(moveHistory);\n\n      await api.saveGame({\n        gameCode: gameId,\n        moveHistory: storedHistory,\n        result,\n        gameMode: 'local',\n        userId: user.id,\n        username: user.username,\n        opponentName: botName,\n        opponentElo: botElo,\n        playerColor: playerColor === 'w' ? 'white' : 'black',\n        finalFen: game.fen(),\n      });\n      \n      console.log('✅ Game saved to database');\n    } catch (error) {\n      console.error('𳚨 Failed to save game:', error);\n    }\n  }, [game, gameId, moveHistory, isOnline, user, playerColor]);\n\n  // Save game to database when it ends\n  useEffect(() => {\n    if (getGameStatus !== 'playing' && !hasResigned && moveHistory.length > 0) {\n      let result;\n      if (game.isCheckmate()) {\n        result = game.turn() === 'w' ? 'black' : 'white';\n      } else if (game.isDraw()) {\n        result = 'draw';\n      } else {\n        result = 'unknown';\n      }\n      saveGameToDatabase('game_end', result);\n    }\n  }, [getGameStatus, hasResigned, moveHistory.length, game, saveGameToDatabase]);\n\n  // Get coaching feedback after player move (only for Coach bot)\n  const requestCoachingFeedback = useCallback(async (fenBefore, move, history) => {\n    if (!selectedBotRef.current.isCoach) return;\n    \n    setIsCoachingLoading(true);\n    setBotMessage('Analyzing your move...');\n    try {\n      const feedback = await getCoachingFeedback(fenBefore, move, toSanHistory(history), (streamedText) => {\n        setBotMessage(streamedText);\n      });\n      if (feedback) {\n        setBotMessage(feedback);\n        setCoachingTip(feedback);\n      }\n    } catch (error) {\n      console.error('[ChessGame] Coaching feedback error:', error);\n      setBotMessage('Analysis unavailable');\n    } finally {\n      setIsCoachingLoading(false);\n    }\n  }, []);\n\n  const resolvePromotion = useCallback((from, to, pieceType) => {\n    const isPawn = pieceType === 'p';\n    if (!isPawn) return null;\n\n    const promotionRank = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');\n    if (!promotionRank) return null;\n\n    if (settingsRef.current.autoQueen) {\n      return 'q';\n    }\n\n    const selection = window.prompt('Promote to (q, r, b, n):', 'q');\n    const choice = (selection || 'q').toLowerCase();\n    if (['q', 'r', 'b', 'n'].includes(choice)) {\n      return choice;\n    }\n    return 'q';\n  }, []);\n\n\n  const handlePieceDrop = useCallback((from, to) => {\n    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;\n\n    const movingPiece = game.get(from);\n    if (!movingPiece || movingPiece.color !== playerColor) return false;\n\n    const promotion = resolvePromotion(from, to, movingPiece.type);\n    const moveAttempt = {\n      from,\n      to,\n      promotion: promotion || 'q',\n    };\n\n    try {\n      const gameCopy = new Chess(game.fen());\n      const move = gameCopy.move(moveAttempt);\n\n      if (move) {\n        const fenBefore = game.fen();\n        setGame(gameCopy);\n        const nextHistory = [...moveHistory, move];\n        setMoveHistory(nextHistory);\n        haptics.move();\n        setSelectedSquare(null);\n        setPossibleMoves([]);\n\n        const bot = selectedBotRef.current;\n        if (gameCopy.isCheckmate()) setBotMessage(getRandomQuote(bot, 'lose'));\n        else if (gameCopy.isDraw()) setBotMessage(getRandomQuote(bot, 'draw'));\n        else if (move.captured) setBotMessage(getRandomQuote(bot, 'capture'));\n\n        playSoundEffect(settingsRef.current, { type: move.captured ? 'capture' : 'move' });\n        if (gameCopy.inCheck()) playSoundEffect(settingsRef.current, { type: 'check' });\n\n        requestCoachingFeedback(fenBefore, move.san, nextHistory);\n        return true;\n      }\n    } catch (e) {\n      console.error("Invalid move", e);\n    }\n\n    return false;\n  }, [game, playerColor, isThinking, hasResigned, requestCoachingFeedback, resolvePromotion, moveHistory]);\n\n  const canDragPiece = useCallback((pieceType, square) => {\n    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;\n    const piece = game.get(square);\n    return Boolean(piece && piece.color === playerColor && pieceType?.[0] === playerColor);\n  }, [game, playerColor, isThinking, hasResigned]);\n\n  const onSquareClick = useCallback(\n    (square) => {\n      if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return;\n\n      const piece = game.get(square);\n\n      if (selectedSquare) {\n        if (square === selectedSquare) {\n          setSelectedSquare(null);\n          setPossibleMoves([]);\n          return;\n        }\n\n        // Tap to move: if clicking another piece of the same color, switch selection\n        if (piece && piece.color === playerColor) {\n          setSelectedSquare(square);\n          haptics.select();\n          const moves = game.moves({ square, verbose: true });\n          setPossibleMoves(moves.map((m) => m.to));\n          return;\n        }\n\n        if (handlePieceDrop(selectedSquare, square)) {\n          return;\n        }\n      }\n\n      const pieceToSelect = game.get(square);\n      if (pieceToSelect && pieceToSelect.color === playerColor) {\n        setSelectedSquare(square);\n        haptics.select();\n        const moves = game.moves({ square, verbose: true });\n        setPossibleMoves(moves.map((m) => m.to));\n      } else {\n        setSelectedSquare(null);\n        setPossibleMoves([]);\n      }\n    },\n    [game, playerColor, selectedSquare, isThinking, hasResigned, handlePieceDrop]\n  );\n\n  const handleNewGame = useCallback(() => {\n    const newId = generateGameId();\n    suppressPersistRef.current = true;\n    setGameId(newId);\n    const newGame = new Chess();\n    setGame(newGame);\n    setMoveHistory([]);\n    setSelectedSquare(null);\n    setPossibleMoves([]);\n    setIsThinking(false);\n    setBotMessage(getRandomQuote(selectedBot, 'start'));\n    setCoachingTip(null);\n    setHasResigned(false);\n    setHasLoadedPersistedState(true);\n    setEngineError(null);\n    engineErrorRef.current = false;\n    busyRetryCountRef.current = 0;\n  }, [selectedBot]);\n\n  const handleResign = useCallback(() => {\n    if (hasResigned || game.isGameOver()) return;\n    setHasResigned(true);\n    setBotMessage(getRandomQuote(selectedBot, 'win'));\n    // Save game to database\n    saveGameToDatabase('resigned', selectedBot.name === 'You' ? 'black' : 'white');\n  }, [hasResigned, game, selectedBot, saveGameToDatabase]);\n\n  const handleUndo = useCallback(() => {\n    const gameCopy = buildGameFromHistory(moveHistory, game.fen());\n    gameCopy.undo();\n    gameCopy.undo();\n    setGame(gameCopy);\n    setMoveHistory(gameCopy.history({ verbose: true }));\n    setSelectedSquare(null);\n    setPossibleMoves([]);\n  }, [game, moveHistory]);\n\n  const handleFlipBoard = useCallback(() => {\n    const newOrientation = boardOrientation === 'white' ? 'black' : 'white';\n    setBoardOrientation(newOrientation);\n    // When board is oriented for white, player plays white (at bottom)\n    // When board is oriented for black, player plays black (at bottom)\n    setPlayerColor(newOrientation === 'white' ? 'w' : 'b');\n  }, [boardOrientation]);\n\n  const handleSelectBot = useCallback((bot) => {\n    setSelectedBot(bot);\n    setBotMessage(getRandomQuote(bot, 'start'));\n  }, []);\n\n  const handleCustomEloChange = useCallback((newElo) => {\n    setCustomElo(newElo);\n  }, []);\n\n  const handleGetHint = useCallback(async () => {\n    if (!settingsRef.current.showHints) return;\n    if (game.isGameOver() || isThinking) return;\n    \n    setHintMove(null);\n    \n    try {\n      // Use a fast but decent configuration for quick hints\n      // depth: 8 and nodes: 5000 gives good moves in ~200-500ms\n      const response = await api.getEngineMove({\n        fen: game.fen(),\n        bot: { name: 'Hint', depth: 8, nodes: 5000 },\n        debug: false,\n      });\n\n      if (response && response.bestMove) {\n        const coords = getMoveCoords(game, response.bestMove);\n        if (coords) {\n          setHintMove({ from: coords.from, to: coords.to });\n          setTimeout(() => setHintMove(null), 3000);\n        }\n      }\n    } catch (err) {\n      console.error('[ChessGame] Hint error:', err);\n    }\n  }, [game, isThinking]);\n\n  const handleReview = useCallback(() => {\n    navigate(`/analysis/${gameId}`, { state: { moveHistory } });\n  }, [navigate, gameId, moveHistory]);\n\n  useImperativeHandle(\n    ref,\n    () => ({\n      newGame: handleNewGame,\n      undo: handleUndo,\n      flipBoard: handleFlipBoard,\n      hint: handleGetHint,\n      resign: handleResign,\n      review: handleReview,\n      getStatus: () => getGameStatus,\n    }),\n    [handleNewGame, handleUndo, handleFlipBoard, handleGetHint, handleResign, handleReview, getGameStatus],\n  );\n\n  // Safety check - if game failed to initialize, show error\n  if (!game) {\n    return (\n      <div className="chess-game-error">\n        <div className="error-message">\n          <h2>⚠️ Game Initialization Error</h2>\n          <p>Failed to initialize the chess game. Please refresh the page.</p>\n          <button\n            onClick={() => window.location.reload()}\n            className="retry-button"\n          >\n            Refresh Page\n          </button>\n        </div>\n      </div>\n    );\n  }\n\n  const customSquareStyles = {};\n\n  if (settings.highlightMoves) {\n    if (selectedSquare) {\n      customSquareStyles[selectedSquare] = {\n        backgroundColor: 'rgba(247, 247, 105, 0.5)',\n      };\n    }\n\n    possibleMoves.forEach((square) => {\n      const piece = game.get(square);\n      customSquareStyles[square] = {\n        background: piece\n          ? 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 85%, transparent 85%)'\n          : 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 25%, transparent 25%)',\n        borderRadius: '50%',\n      };\n    });\n  }\n\n  if (game.inCheck()) {\n    const kingSquare = findKingSquare(game, game.turn());\n    if (kingSquare) {\n      customSquareStyles[kingSquare] = {\n        backgroundColor: 'rgba(255, 0, 0, 0.5)',\n      };\n    }\n  }\n\n  if (hintMove && settings.showHints) {\n    customSquareStyles[hintMove.from] = {\n      backgroundColor: 'rgba(0, 255, 0, 0.5)',\n    };\n    customSquareStyles[hintMove.to] = {\n      backgroundColor: 'rgba(0, 255, 0, 0.5)',\n    };\n  }\n\n  const topPlayer = boardOrientation === 'white' \n    ? { name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name, avatar: selectedBot?.avatar, rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating, isBot: true, color: 'b', botColor: selectedBot?.color, isCoach: selectedBot?.isCoach }\n    : { name: 'You', avatar: '👤', rating: '???', isBot: false, color: 'w', isCoach: false };\n  \n  const bottomPlayer = boardOrientation === 'white'\n    ? { name: 'You', avatar: '👤', rating: '???', isBot: false, color: 'w', isCoach: false }\n    : { name: selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name, avatar: selectedBot?.avatar, rating: selectedBot?.id === 'custom' ? customElo : selectedBot?.rating, isBot: true, color: 'b', botColor: selectedBot?.color, isCoach: selectedBot?.isCoach };\n\n  const canReview = getGameStatus === 'checkmate' || getGameStatus === 'resigned';\n\n  return (\n    <div className="chess-game">\n      <div className="game-container">\n          <div className="board-section">\n            <PlayerBar\n              {...topPlayer}\n              isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}\n              capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}\n              botMessage={topPlayer.isBot ? botMessage : null}\n            />\n            <div className="board-wrapper">\n              <ChessBoard\n                position={game}\n                onSquareClick={onSquareClick}\n                onPieceDrop={handlePieceDrop}\n                canDragPiece={canDragPiece}\n                boardOrientation={boardOrientation}\n                customSquareStyles={customSquareStyles}\n                showCoordinates={settings.showCoordinates}\n                boardTheme={settings.boardTheme}\n              />\n              {animatingPieces.map((anim) => (\n                <AnimatedPiece\n                  key={anim.id}\n                  piece={anim.piece}\n                  fromSquare={anim.fromSquare}\n                  toSquare={anim.toSquare}\n                  boardOrientation={boardOrientation}\n                  captured={anim.captured}\n                  onComplete={() => removeAnimation(anim.id)}\n                />\n              ))}\n              {showVictory && (\n                <div className="victory-burst" role="status" aria-live="polite">\n                  <span className="victory-spark" />\n                  <span className="victory-text">Checkmate!</span>\n                </div>\n              )}\n            </div>\n            <PlayerBar\n              {...bottomPlayer}\n              isActive={game.turn() === (boardOrientation === 'white' ? 'w' : 'b')}\n              capturedPieces={capturedPieces[bottomPlayer.color === 'w' ? 'b' : 'w']}\n              botMessage={bottomPlayer.isBot ? botMessage : null}\n            />\n            <GameStatus engineError={engineError} />\n            {settings.debugMode && (\n              <DebugPanel debugInfo={debugInfo} isThinking={isThinking} />\n            )}\n          </div>\n\n          <div className="sidebar">\n            <div className="sidebar-header">\n              <span className="game-id-label" title="Game ID">Game {gameId}</span>\n            </div>\n            <BotSelector\n              selectedBot={selectedBot}\n              onSelectBot={handleSelectBot}\n              disabled={isThinking}\n              customElo={customElo}\n              onCustomEloChange={handleCustomEloChange}\n            />\n            <GameControls\n              gameStatus={getGameStatus}\n              turn={game.turn()}\n              playerColor={playerColor}\n              selectedBot={selectedBot}\n              botMessage={botMessage}\n              onNewGame={handleNewGame}\n              onUndo={handleUndo}\n              onFlipBoard={handleFlipBoard}\n              onGetHint={handleGetHint}\n              onResign={handleResign}\n              isThinking={isThinking}\n              canUndo={moveHistory.length >= 2}\n              onReview={handleReview}\n              showHints={settings.showHints}\n              canAnalyze={Boolean(user)}\n              canReview={canReview}\n            />\n\n            {selectedBot.isCoach && (\n              <CoachingTip\n                tip={coachingTip}\n                isLoading={isCoachingLoading}\n                onDismiss={() => setCoachingTip(null)}\n              />\n            )}\n            <MoveHistory history={moveHistory} />\n          </div>\n      </div>\n\n    </div>\n  );\n}\n\nexport default forwardRef(ChessGame);