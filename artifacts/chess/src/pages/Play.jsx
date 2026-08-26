import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ChessGame from '../components/ChessGame';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import GameBottomBar from '../components/GameBottomBar';
import PlaySetup from '../components/PlaySetup';
import { BOTS, createCustomBot } from '../engine/bots/bots';
import { generateGameId } from '../engine/game/gameId';
import api from '../services/api';
import {
  loadLocalGame,
  saveLocalGame,
  clearLocalGame,
} from '../utils/gamePersistence';

import './Play.css';

function botFromSetup(setup) {
  if (!setup) return BOTS.find((b) => b.id === 'nelson') || BOTS[0];
  if (setup.selectedBot) return setup.selectedBot;
  if (setup.botId === 'custom') return createCustomBot(setup.customElo ?? 1000);
  if (setup.botId) return BOTS.find((b) => b.id === setup.botId) || BOTS[0];
  return BOTS.find((b) => b.id === 'nelson') || BOTS[0];
}

export default function Play({ initialGameId = null, initialSetup = null }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const { user, isLoggedIn, isOnline } = useUser();

  const queryMode = (searchParams.get('mode') || '').toLowerCase();

  const resumedFromStorage = useMemo(
    () => (initialGameId ? loadLocalGame(initialGameId) : null),
    [initialGameId],
  );

  const effectiveGameId = initialGameId ? String(initialGameId).toUpperCase() : null;

  const mergedSetup = useMemo(() => {
    if (initialSetup?.gameMode) {
      return {
        gameMode: initialSetup.gameMode,
        whiteName: initialSetup.whiteName || user?.username || 'Player 1',
        blackName: initialSetup.blackName || 'Player 2',
        autoRotate: initialSetup.autoRotate ?? true,
        selectedBot: initialSetup.selectedBot,
        customElo: initialSetup.customElo,
        playerColor: initialSetup.playerColor || 'w',
      };
    }
    if (resumedFromStorage) {
      return {
        gameMode: resumedFromStorage.gameMode || 'bot',
        whiteName: resumedFromStorage.whiteName || user?.username || 'Player 1',
        blackName: resumedFromStorage.blackName || 'Player 2',
        autoRotate: resumedFromStorage.autoRotate ?? true,
        selectedBot: botFromSetup(resumedFromStorage),
        customElo: resumedFromStorage.customElo ?? 1000,
        playerColor: resumedFromStorage.playerColor || 'w',
      };
    }
    return {
      gameMode: queryMode === 'pass_and_play' ? 'pass_and_play' : 'bot',
      whiteName: user?.username || 'Player 1',
      blackName: 'Player 2',
      autoRotate: true,
      selectedBot: BOTS.find((b) => b.id === 'nelson') || BOTS[0],
      customElo: 1000,
      playerColor: 'w',
    };
  }, [initialSetup, resumedFromStorage, queryMode, user?.username]);

  const [phase, setPhase] = useState(effectiveGameId ? 'game' : 'setup');
  const [gameMode, setGameMode] = useState(mergedSetup?.gameMode || 'bot');
  const [whiteName, setWhiteName] = useState(mergedSetup?.whiteName || 'Player 1');
  const [blackName, setBlackName] = useState(mergedSetup?.blackName || 'Player 2');
  const [autoRotate, setAutoRotate] = useState(mergedSetup?.autoRotate ?? true);
  const [playerColor, setPlayerColor] = useState(mergedSetup?.playerColor || 'w');
  const [customElo, setCustomElo] = useState(mergedSetup?.customElo ?? 1000);
  const [selectedBot, setSelectedBot] = useState(
    () => mergedSetup?.selectedBot || BOTS.find((b) => b.id === 'nelson') || BOTS[0],
  );
  const [activeGameId, setActiveGameId] = useState(effectiveGameId);

  const boardOrientation = useMemo(
    () => (playerColor === 'w' ? 'white' : 'black'),
    [playerColor],
  );

  async function handleStart() {
    const gameId = activeGameId || generateGameId();
    const isPassAndPlay = gameMode === 'pass_and_play';
    const effectiveWhite = isPassAndPlay ? (whiteName.trim() || 'Player 1') : (user?.username || 'You');
    const effectiveBlack = isPassAndPlay ? (blackName.trim() || 'Player 2') : (selectedBot?.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot?.name);

    if (!user && !isPassAndPlay) {
      // Guest local game vs bot
    } else if (!isOnline) {
      window.alert('You are offline. Game progress will be saved locally on this device.');
    }

    saveLocalGame({
      gameId,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveHistory: [],
      gameMode,
      whiteName: effectiveWhite,
      blackName: effectiveBlack,
      autoRotate: isPassAndPlay ? autoRotate : false,
      playerColor,
      boardOrientation: isPassAndPlay ? 'white' : (playerColor === 'w' ? 'white' : 'black'),
      botId: isPassAndPlay ? null : selectedBot.id,
      botName: isPassAndPlay ? null : effectiveBlack,
      customElo: isPassAndPlay ? null : customElo,
      result: 'in_progress',
    });

    if (isOnline && user) {
      try {
        await api.createLocalGame({
          gameCode: gameId,
          userId: user.id,
          username: user.username,
          opponentName: effectiveBlack,
          opponentElo: isPassAndPlay ? 1200 : (selectedBot.id === 'custom' ? customElo : selectedBot.rating),
          playerColor: isPassAndPlay ? 'white' : (playerColor === 'w' ? 'white' : 'black'),
        });
      } catch (error) {
        console.error('[Play] Failed to create local game:', error);
      }
    }

    const routeMode = isPassAndPlay ? 'pass_and_play' : 'local';
    navigate(`/game/${gameId}?mode=${routeMode}`, {
      replace: Boolean(activeGameId),
      state: {
        gameMode,
        whiteName: effectiveWhite,
        blackName: effectiveBlack,
        autoRotate,
        selectedBot,
        customElo,
        playerColor,
      },
    });

    setActiveGameId(gameId);
    setPhase('game');
  }

  const gameRef = useRef(null);
  const [uiState, setUiState] = useState({
    canUndo: false,
    isThinking: false,
    gameStatus: 'playing',
    showHints: true,
  });

  function handleSetup() {
    if (activeGameId) {
      clearLocalGame(activeGameId);
    }
    setPhase('setup');
    setActiveGameId(null);
    navigate('/play', { replace: true });
  }

  function handleUndo() {
    gameRef.current?.undo?.();
  }

  function handleFlipBoard() {
    gameRef.current?.flipBoard?.();
  }

  function handleHint() {
    gameRef.current?.hint?.();
  }

  function handleResign() {
    gameRef.current?.resign?.();
  }

  function handleReview() {
    gameRef.current?.review?.();
  }

  const canReview = uiState.gameStatus === 'checkmate' || uiState.gameStatus === 'resigned';

  return (
    <div className="play-page">
      {phase === 'setup' ? (
        <PlaySetup
          gameMode={gameMode}
          onSelectGameMode={setGameMode}
          whiteName={whiteName}
          onWhiteNameChange={setWhiteName}
          blackName={blackName}
          onBlackNameChange={setBlackName}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
          selectedBot={selectedBot}
          onSelectBot={setSelectedBot}
          customElo={customElo}
          onCustomEloChange={setCustomElo}
          playerColor={playerColor}
          onSelectColor={setPlayerColor}
          onStart={handleStart}
          isLoggedIn={isLoggedIn}
        />
      ) : (
        <>
          <ChessGame
            ref={gameRef}
            initialGameId={activeGameId || effectiveGameId}
            initialGameMode={gameMode}
            initialWhiteName={whiteName}
            initialBlackName={blackName}
            initialAutoRotate={autoRotate}
            initialSelectedBot={selectedBot}
            initialCustomElo={customElo}
            initialBoardOrientation={boardOrientation}
            initialPlayerColor={playerColor}
            onUiStateChange={setUiState}
            isLoggedIn={isLoggedIn}
          />
          <GameBottomBar
            onNew={handleSetup}
            onUndo={handleUndo}
            onFlipBoard={handleFlipBoard}
            onHint={handleHint}
            onResign={handleResign}
            onReview={handleReview}
            canUndo={uiState.canUndo}
            isThinking={uiState.isThinking}
            showHints={settings.showHints}
            canReview={canReview}
            botMessage={uiState.botMessage}
            selectedBot={uiState.selectedBot}
          />
        </>
      )}
    </div>
  );
}
