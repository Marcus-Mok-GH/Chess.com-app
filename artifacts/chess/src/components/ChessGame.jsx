import haptics from '../utils/haptics';
import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ChessBoard from './ChessBoard';
import { Chess } from 'chess.js';
import { useSettings } from '../contexts/SettingsContext';
import { playSoundEffect } from '../utils/sound';
import MoveHistory from './MoveHistory';
import GameControls from './GameControls';
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
import {
  saveLocalGame,
  loadLocalGame,
  clearLocalGame,
  markLocalGameFinished,
} from '../utils/gamePersistence';

import { findKingSquare, applyEngineMove, getMoveCoords } from './ChessGame/utils';
import { useCapturedPieces, usePieceAnimations } from './ChessGame/hooks';
import GameStatus from './ChessGame/subcomponents/GameStatus';
import './ChessGame.css';

function resolveBotFromPersisted(persisted, fallbackBot) {
  if (persisted?.botId === 'custom') {
    return createCustomBot(persisted.customElo ?? 1000);
  }
  if (persisted?.botId) {
    return BOTS.find((b) => b.id === persisted.botId) || fallbackBot;
  }
  return fallbackBot;
}

function ChessGame(
  {
    initialSelectedBot,
    initialCustomElo,
    initialBoardOrientation,
    initialPlayerColor,
    onUiStateChange,
    initialGameId,
    isLoggedIn,
  },
  ref,
) {
  const { user, isOnline } = useUser();
  const { settings } = useSettings();

  const resolvedGameId = useMemo(
    () => (initialGameId ? String(initialGameId).toUpperCase() : generateGameId()),
    // Only resolve once per mount / game id prop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialGameId],
  );

  // Synchronous localStorage restore so the board never flashes empty on refresh
  const restoredSnapshot = useMemo(() => {
    if (!initialGameId) return null;
    return loadLocalGame(resolvedGameId);
  }, [initialGameId, resolvedGameId]);

  const defaultBot = initialSelectedBot || BOTS.find((b) => b.id === 'nelson') || BOTS[0];
  const startingBot = resolveBotFromPersisted(restoredSnapshot, defaultBot);
  const startingColor = restoredSnapshot?.playerColor || initialPlayerColor || 'w';
  const startingOrientation =
    restoredSnapshot?.boardOrientation ||
    initialBoardOrientation ||
    (startingColor === 'w' ? 'white' : 'black');
  const startingCustomElo = restoredSnapshot?.customElo ?? initialCustomElo ?? 1000;
  const startingHistory = restoredSnapshot
    ? normalizeMoveHistory(restoredSnapshot.moveHistory)
    : [];
  const startingGame = (() => {
    try {
      if (restoredSnapshot && (startingHistory.length > 0 || restoredSnapshot.fen)) {
        return buildGameFromHistory(startingHistory, restoredSnapshot.fen);
      }
      return new Chess();
    } catch (error) {
      console.error('Failed to initialize chess game:', error);
      return null;
    }
  })();

  const [game, setGame] = useState(() => startingGame);
  const [boardOrientation, setBoardOrientation] = useState(startingOrientation);
  const [playerColor, setPlayerColor] = useState(startingColor);
  const [selectedBot, setSelectedBot] = useState(() => {
    try {
      return startingBot;
    } catch (error) {
      console.error('Failed to initialize bot:', error);
      return null;
    }
  });
  const [customElo, setCustomElo] = useState(startingCustomElo);
  const [isThinking, setIsThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState(startingHistory);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [botMessage, setBotMessage] = useState('');
  const [hintMove, setHintMove] = useState(null);
  const [gameId, setGameId] = useState(resolvedGameId);
  // If we already restored from localStorage, mark loaded; otherwise wait for DB/local load
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(() => Boolean(restoredSnapshot) || !initialGameId);
  const navigate = useNavigate();
  const [debugInfo, setDebugInfo] = useState(null);
  const [coachingTip, setCoachingTip] = useState(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState(false);
  const [hasResigned, setHasResigned] = useState(() => Boolean(restoredSnapshot?.hasResigned));
  const [showVictory, setShowVictory] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const gameRef = useRef(game);
  const selectedBotRef = useRef(selectedBot);
  const customEloRef = useRef(customElo);
  const settingsRef = useRef(settings);
  const moveHistoryRef = useRef(moveHistory);
  const isThinkingRef = useRef(isThinking);
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);

  const engineErrorRef = useRef(false);
  const busyRetryCountRef = useRef(0);

  const suppressPersistRef = useRef(false);
  const playerColorRef = useRef(playerColor);
  const boardOrientationRef = useRef(boardOrientation);

  const { animatingPieces, triggerAnimation, removeAnimation } = usePieceAnimations();
  const capturedPieces = useCapturedPieces(game);

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
    playerColorRef.current = playerColor;
  }, [playerColor]);

  useEffect(() => {
    boardOrientationRef.current = boardOrientation;
  }, [boardOrientation]);

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

  const persistLocalSnapshot = useCallback((currentGame, currentHistory, extra = {}) => {
    if (suppressPersistRef.current || !currentGame) return;

    const bot = selectedBotRef.current;
    const gameResult = extra.result
      || (currentGame.isCheckmate()
        ? (currentGame.turn() === 'w' ? 'black' : 'white')
        : currentGame.isDraw()
          ? 'draw'
          : 'in_progress');

    saveLocalGame({
      gameId,
      fen: currentGame.fen(),
      moveHistory: toStoredMoveHistory(currentHistory),
      playerColor: playerColorRef.current,
      boardOrientation: boardOrientationRef.current,
      botId: bot?.id || null,
      botName: bot?.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot?.name,
      customElo: customEloRef.current,
      hasResigned: Boolean(extra.hasResigned),
      result: gameResult,
    });
  }, [gameId]);

  const persistGame = useCallback(async (currentGame, currentHistory) => {
    if (!hasLoadedPersistedState || !currentGame || suppressPersistRef.current) return;

    // Always keep a local snapshot so refresh survives even offline / as guest
    persistLocalSnapshot(currentGame, currentHistory);

    if (!isOnline || !user) return;

    try {
      const gameResult = currentGame.isCheckmate()
        ? (currentGame.turn() === 'w' ? 'black' : 'white')
        : currentGame.isDraw()
          ? 'draw'
          : 'in_progress';

      const bot = selectedBotRef.current;
      const botName = bot.id === 'custom' ? `Custom Bot (${customEloRef.current})` : bot.name;
      const botElo = bot.id === 'custom' ? customEloRef.current : bot.rating;

      const storedHistory = toStoredMoveHistory(currentHistory);

      await api.saveGame({
        gameCode: gameId,
        moveHistory: storedHistory,
        result: gameResult,
        gameMode: 'local',
        userId: user.id,
        opponentName: botName,
        opponentElo: botElo,
        playerColor: playerColor === 'w' ? 'white' : 'black',
        finalFen: currentGame.fen(),
      });
      console.log('[ChessGame] Persisted game state to DB');
    } catch (error) {
      console.error('[ChessGame] Failed to persist game state:', error);
    }
  }, [gameId, hasLoadedPersistedState, isOnline, playerColor, user, persistLocalSnapshot]);

  useEffect(() => {
    if (hasLoadedPersistedState) return;

    let isMounted = true;
    const loadState = async () => {
      // 1) Prefer localStorage (instant, works offline / guest)
      const local = loadLocalGame(gameId);
      if (local) {
        const normalizedHistory = normalizeMoveHistory(local.moveHistory);
        const restoredGame = buildGameFromHistory(normalizedHistory, local.fen);
        if (!isMounted) return;

        setGame(restoredGame);
        setMoveHistory(normalizedHistory);
        if (local.playerColor) setPlayerColor(local.playerColor);
        if (local.boardOrientation) setBoardOrientation(local.boardOrientation);
        if (local.customElo != null) setCustomElo(local.customElo);
        if (local.hasResigned) setHasResigned(true);
        const bot = resolveBotFromPersisted(local, selectedBotRef.current);
        if (bot) setSelectedBot(bot);

        setHasLoadedPersistedState(true);
        console.log('[ChessGame] Loaded game state from localStorage');
        return;
      }

      // 2) Fall back to DB when logged in
      if (!user || !isOnline) {
        if (isMounted) setHasLoadedPersistedState(true);
        return;
      }

      try {
        const match = await api.getLocalGameByCode(user.username, gameId);
        if (!isMounted) return;

        if (!match) {
          setHasLoadedPersistedState(true);
          return;
        }

        const normalizedHistory = normalizeMoveHistory(match.move_history);
        const restoredGame = match.fen
          ? buildGameFromHistory(normalizedHistory, match.fen)
          : buildGameFromHistory(normalizedHistory);

        setGame(restoredGame);
        setMoveHistory(normalizedHistory);
        setHasLoadedPersistedState(true);
        // Mirror into localStorage for next refresh
        persistLocalSnapshot(restoredGame, normalizedHistory);
        console.log('[ChessGame] Loaded game state from database');
      } catch (error) {
        console.error('[ChessGame] Failed to load saved game state:', error);
        if (isMounted) setHasLoadedPersistedState(true);
      }
    };

    loadState();
    return () => {
      isMounted = false;
    };
  }, [gameId, hasLoadedPersistedState, user, isOnline, persistLocalSnapshot]);

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

  const makeAIMove = useCallback(async () => {
    if (gameRef.current.isGameOver() || isThinkingRef.current || engineErrorRef.current) return;

    setIsThinking(true);
    isThinkingRef.current = true;

    let bot = selectedBotRef.current;
    if (bot.id === 'custom') {
      bot = createCustomBot(customEloRef.current);
    }

    const fen = gameRef.current.fen();
    if (!bot.isCoach) setBotMessage(getRandomQuote(bot, 'thinking'));

    try {
      const response = await api.getEngineMove({
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

      const { bestMove, debugInfo: newDebugInfo } = response;

      busyRetryCountRef.current = 0;
      setEngineError(null);

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

        setTimeout(() => {
          if (moveResult.captured) haptics.capture(); else haptics.move();
          setGame(newGame);
          const nextHistory = [...history, moveResult];
          setMoveHistory(nextHistory);
          persistGame(newGame, nextHistory);

          if (!bot.isCoach) {
            if (newGame.isCheckmate()) {
              setBotMessage(getRandomQuote(bot, "win"));
            } else if (newGame.isDraw()) {
              setBotMessage(getRandomQuote(bot, "draw"));
            } else if (newGame.inCheck()) {
              setBotMessage(getRandomQuote(bot, "check"));
            } else if (moveResult.captured) {
              setBotMessage(getRandomQuote(bot, "capture"));
            } else if (Math.random() < 0.15) {
              const categories = ["thinking", "blunder", "goodMove"];
              setBotMessage(getRandomQuote(bot, categories[Math.floor(Math.random() * categories.length)]));
            }
          }
        }, 50);
      }
    } catch (err) {
      console.error('[ChessGame] Engine error:', err);
      busyRetryCountRef.current = (busyRetryCountRef.current || 0) + 1;
      if (busyRetryCountRef.current >= 3) {
        engineErrorRef.current = true;
        setEngineError(err.message || 'Failed to connect to chess engine');
      } else {
        setEngineError(`Engine error (attempt ${busyRetryCountRef.current}/3): ${err.message}`);
      }
    } finally {
      setIsThinking(false);
      isThinkingRef.current = false;
    }
  }, [triggerAnimation, persistGame]);

  useEffect(() => {
    if (!game || !hasLoadedPersistedState) return;
    if (game.turn() !== playerColor && !game.isGameOver() && !isThinking && !hasResigned) {
      const timer = setTimeout(() => {
        if (
          gameRef.current &&
          gameRef.current.turn() !== playerColor &&
          !gameRef.current.isGameOver() &&
          !isThinkingRef.current
        ) {
          makeAIMove();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [game, playerColor, isThinking, makeAIMove, hasLoadedPersistedState, hasResigned]);

  const saveGameToDatabase = useCallback(async (reason, winner) => {
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

    // Local persistence first so finished games don't re-open as active on refresh
    persistLocalSnapshot(game, moveHistory, {
      result: reason === 'resigned' ? 'resigned' : result,
      hasResigned: reason === 'resigned',
    });
    markLocalGameFinished(gameId, reason === 'resigned' ? 'resigned' : result);

    if (!isOnline || !user) return;

    try {
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
        opponentName: botName,
        opponentElo: botElo,
        playerColor: playerColor === 'w' ? 'white' : 'black',
        finalFen: game.fen(),
      });

      console.log('✅ Game saved to database');
    } catch (error) {
      console.error('🔸 Failed to save game:', error);
    }
  }, [game, gameId, moveHistory, isOnline, user, playerColor, persistLocalSnapshot]);

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

  const requestCoachingFeedback = useCallback(async (fenBefore, move, history) => {
    if (!selectedBotRef.current.isCoach) return;
    if (!user) {
      navigate('/login');
      return;
    }
    
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
      if (error.status === 401 || error.status === 403 || error.message?.toLowerCase().includes('log in') || error.message?.toLowerCase().includes('auth')) {
        navigate('/login');
      } else {
        setBotMessage('Analysis unavailable');
      }
    } finally {
      setIsCoachingLoading(false);
    }
  }, [user, navigate]);

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

  const handlePieceDrop = useCallback((from, to) => {
    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;

    const moving_piece = game.get(from);
    if (!moving_piece || moving_piece.color !== playerColor) return false;

    const promotion = resolvePromotion(from, to, moving_piece.type);
    const moveAttempt = {
      from,
      to,
      promotion: promotion || 'q',
    };

    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move(moveAttempt);

      if (move) {
        const fenBefore = game.fen();
        setGame(gameCopy);
        const nextHistory = [...moveHistory, move];
        setMoveHistory(nextHistory);
        persistGame(gameCopy, nextHistory);
        haptics.move();
        setSelectedSquare(null);
        setPossibleMoves([]);

        const bot = selectedBotRef.current;
        if (gameCopy.isCheckmate()) setBotMessage(getRandomQuote(bot, 'lose'));
        else if (gameCopy.isDraw()) setBotMessage(getRandomQuote(bot, 'draw'));
        else if (move.captured) setBotMessage(getRandomQuote(bot, 'capture'));

        playSoundEffect(settingsRef.current, { type: move.captured ? 'capture' : 'move' });
        if (gameCopy.inCheck()) playSoundEffect(settingsRef.current, { type: 'check' });

        requestCoachingFeedback(fenBefore, move.san, nextHistory);
        return true;
      }
    } catch (e) {
      console.error("Invalid move", e);
    }

    return false;
  }, [game, playerColor, isThinking, hasResigned, requestCoachingFeedback, resolvePromotion, moveHistory, persistGame]);

  const canDragPiece = useCallback((pieceType, square) => {
    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;
    const piece = game.get(square);
    return Boolean(piece && piece.color === playerColor && pieceType?.[0] === playerColor);
  }, [game, playerColor, isThinking, hasResigned]);

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return;

      const piece = game.get(square);

      // 1. Selection logic: If clicking our own piece, always select it
      if (piece && piece.color === playerColor) {
        // If clicking same square, deselect
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }
        
        // Otherwise select new piece
        setSelectedSquare(square);
        haptics.select();
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
        return;
      }

      // 2. Move logic: If we have a selection and click a non-own-piece square
      if (selectedSquare) {
        // Check if it's a legal move
        const isLegal = possibleMoves.includes(square);
        
        if (isLegal) {
          // Execute the move
          handlePieceDrop(selectedSquare, square);
          return;
        }
      }

      // 3. Deselect if clicking anywhere else or invalid move
      setSelectedSquare(null);
      setPossibleMoves([]);
    },
    [game, playerColor, selectedSquare, possibleMoves, isThinking, game.isGameOver(), hasResigned, handlePieceDrop]
  );

  const handleNewGame = useCallback(() => {
    const newId = generateGameId();
    suppressPersistRef.current = true;
    clearLocalGame(gameId);
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
    setEngineError(null);
    engineErrorRef.current = false;
    busyRetryCountRef.current = 0;
    // Allow persistence for the new game after state settles
    setTimeout(() => {
      suppressPersistRef.current = false;
      saveLocalGame({
        gameId: newId,
        fen: newGame.fen(),
        moveHistory: [],
        playerColor: playerColorRef.current,
        boardOrientation: boardOrientationRef.current,
        botId: selectedBotRef.current?.id,
        botName: selectedBotRef.current?.name,
        customElo: customEloRef.current,
        result: 'in_progress',
      });
    }, 0);
  }, [selectedBot, gameId]);

  const handleResign = useCallback(() => {
    if (hasResigned || game.isGameOver()) return;
    setHasResigned(true);
    setBotMessage(getRandomQuote(selectedBot, 'win'));
    // Player resigned → opponent (bot) wins
    const winner = playerColor === 'w' ? 'black' : 'white';
    saveGameToDatabase('resigned', winner);
  }, [hasResigned, game, selectedBot, saveGameToDatabase, playerColor]);

  const handleUndo = useCallback(() => {
    const gameCopy = buildGameFromHistory(moveHistory, game.fen());
    gameCopy.undo();
    gameCopy.undo();
    setGame(gameCopy);
    const nextHistory = gameCopy.history({ verbose: true });
    setMoveHistory(nextHistory);
    persistGame(gameCopy, nextHistory);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [game, moveHistory, persistGame]);

  const handleFlipBoard = useCallback(() => {
    const newOrientation = boardOrientation === 'white' ? 'black' : 'white';
    setBoardOrientation(newOrientation);
    boardOrientationRef.current = newOrientation;
    // Flipping the board changes only the viewer's perspective. The player's
    // assigned color and turn ownership must remain fixed for the game.
    if (game) {
      persistLocalSnapshot(game, moveHistory);
    }
  }, [boardOrientation, game, moveHistory, persistLocalSnapshot]);

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
    setBotMessage(getRandomQuote(bot, "start"));
  }, []);

  const handleGetHint = useCallback(async () => {
    if (!settingsRef.current.showHints) return;
    if (game.isGameOver() || isThinking) return;
    
    setHintMove(null);
    
    try {
      const response = await api.getEngineMove({
        fen: game.fen(),
        bot: { name: 'Hint', depth: 8, nodes: 5000 },
        debug: false,
      });

      if (response && response.bestMove) {
        const coords = getMoveCoords(game, response.bestMove);
        if (coords) {
          setHintMove({ from: coords.from, to: coords.to });
          setTimeout(() => setHintMove(null), 3000);
        }
      }
    } catch (err) {
      console.error('[ChessGame] Hint error:', err);
    }
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
        backgroundColor: 'rgba(247, 247, 105, 0.5)',
      };
    }

    possibleMoves.forEach((square) => {
      const piece = game.get(square);
      customSquareStyles[square] = {
        background: piece
          ? 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 25%, transparent 25%)',
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
                onSquareClick={onSquareClick}
                onPieceDrop={handlePieceDrop}
                canDragPiece={canDragPiece}
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
            <GameStatus engineError={engineError} />
            {settings.debugMode && (
              <DebugPanel debugInfo={debugInfo} isThinking={isThinking} />
            )}
          </div>

          <div className="sidebar">
            <div className="sidebar-header">
              <span className="game-id-label" title="Game ID">Game {gameId}</span>
            </div>
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