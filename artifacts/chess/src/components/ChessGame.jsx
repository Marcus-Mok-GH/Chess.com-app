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

      // Successful response — reset consecutive-failure counter so future isolated
      // timeouts don't accumulate toward the permanent-block threshold.
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
          // Don't show error to user, just stop thinking
          return;
        }

        

        setTimeout(() => {
          if (moveResult.captured) haptics.capture(); else haptics.move();
          setGame(newGame);
          setMoveHistory([...history, moveResult]);

          if (!bot.isCoach) {
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
          }
        }, 50);
      }
    } catch (err) {
      console.error('[ChessGame] Engine error:', err);
      busyRetryCountRef.current = (busyRetryCountRef.current || 0) + 1;
      // Only permanently block after 3 consecutive failures to allow recovery from
      // transient serverless cold-start timeouts without silencing the bot forever.
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
      console.error('𳚨 Failed to save game:', error);
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


  const handlePieceDrop = useCallback((from, to) => {
    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;

    const movingPiece = game.get(from);
    if (!movingPiece || movingPiece.color !== playerColor) return false;

    const promotion = resolvePromotion(from, to, movingPiece.type);
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
  }, [game, playerColor, isThinking, hasResigned, requestCoachingFeedback, resolvePromotion, moveHistory]);

  const canDragPiece = useCallback((pieceType, square) => {
    if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return false;
    const piece = game.get(square);
    return Boolean(piece && piece.color === playerColor && pieceType?.[0] === playerColor);
  }, [game, playerColor, isThinking, hasResigned]);

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== playerColor || isThinking || game.isGameOver() || hasResigned) return;

      const piece = game.get(square);

      if (selectedSquare) {
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }

        // Tap to move: if clicking another piece of the same color, switch selection
        if (piece && piece.color === playerColor) {
          setSelectedSquare(square);
          haptics.select();
          const moves = game.moves({ square, verbose: true });
          setPossibleMoves(moves.map((m) => m.to));
          return;
        }

        if (handlePieceDrop(selectedSquare, square)) {
          return;
        }
      }

      const pieceToSelect = game.get(square);
      if (pieceToSelect && pieceToSelect.color === playerColor) {
        setSelectedSquare(square);
        haptics.select();
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    },
    [game, playerColor, selectedSquare, isThinking, hasResigned, handlePieceDrop]
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
    setEngineError(null);
    engineErrorRef.current = false;
    busyRetryCountRef.current = 0;
  }, [selectedBot]);

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

  const handleGetHint = useCallback(async () => {
    if (!settingsRef.current.showHints) return;
    if (game.isGameOver() || isThinking) return;
    
    setHintMove(null);
    
    try {
      // Use a fast but decent configuration for quick hints
      // depth: 8 and nodes: 5000 gives good moves in ~200-500ms
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
