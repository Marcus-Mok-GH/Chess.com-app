import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ChessGame from '../components/ChessGame';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import GameBottomBar from '../components/GameBottomBar';
import PlaySetup from '../components/PlaySetup';
import { BOTS } from '../engine/bots/bots';
import { generateGameId } from '../engine/game/gameId';
import api from '../services/api';

import './Play.css';

const PASS_PLAY_STORAGE_KEY = 'pass_play_settings_v1';
const DEFAULT_PASS_PLAY_SETTINGS = {
  whitePlayerName: 'White',
  blackPlayerName: 'Black',
  autoFlipBoard: true,
};

export default function Play({ initialGameId = null, initialSetup = null }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const { user, isOnline } = useUser();
  const modeParam = (searchParams.get('mode') || '').toLowerCase();

  const storedPassPlaySettings = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_PASS_PLAY_SETTINGS;
    try {
      const raw = window.localStorage.getItem(PASS_PLAY_STORAGE_KEY);
      if (!raw) return DEFAULT_PASS_PLAY_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PASS_PLAY_SETTINGS, ...(parsed || {}) };
    } catch (error) {
      console.warn('[Play] Failed to load pass-and-play settings:', error);
      return DEFAULT_PASS_PLAY_SETTINGS;
    }
  }, []);

  const resolvedSetup = initialSetup || (modeParam === 'pass' ? { gameMode: 'pass' } : null);

  const [phase, setPhase] = useState(initialGameId ? 'game' : 'setup');
  const [gameMode, setGameMode] = useState(resolvedSetup?.gameMode || 'bot');
  const [playerColor, setPlayerColor] = useState(resolvedSetup?.playerColor || 'w');
  const [whitePlayerName, setWhitePlayerName] = useState(resolvedSetup?.whitePlayerName || storedPassPlaySettings.whitePlayerName);
  const [blackPlayerName, setBlackPlayerName] = useState(resolvedSetup?.blackPlayerName || storedPassPlaySettings.blackPlayerName);
  const [autoFlipBoard, setAutoFlipBoard] = useState(resolvedSetup?.autoFlipBoard ?? storedPassPlaySettings.autoFlipBoard);
  const [customElo, setCustomElo] = useState(resolvedSetup?.customElo ?? 1000);
  const [selectedBot, setSelectedBot] = useState(() => resolvedSetup?.selectedBot || BOTS.find((b) => b.id === 'nelson') || BOTS[0]);

  const boardOrientation = useMemo(() => (playerColor === 'w' ? 'white' : 'black'), [playerColor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        PASS_PLAY_STORAGE_KEY,
        JSON.stringify({
          whitePlayerName,
          blackPlayerName,
          autoFlipBoard,
        }),
      );
    } catch (error) {
      console.warn('[Play] Failed to persist pass-and-play settings:', error);
    }
  }, [whitePlayerName, blackPlayerName, autoFlipBoard]);

  useEffect(() => {
    const shouldHideNav = phase === 'game';

    // Apply to both <html> and <body> to avoid edge-cases where layout is scoped differently
    document.documentElement.classList.toggle('hide-bottom-nav', shouldHideNav);
    document.body.classList.toggle('hide-bottom-nav', shouldHideNav);

    return () => {
      document.documentElement.classList.remove('hide-bottom-nav');
      document.body.classList.remove('hide-bottom-nav');
    };
  }, [phase]);

  async function handleStart() {
    if (!user) {
      const gameId = initialGameId || generateGameId();
      const passParam = gameMode === 'pass' ? '&variant=pass' : '';
      navigate(`/game/${gameId}?mode=local${passParam}`, {
        replace: Boolean(initialGameId),
        state: {
          selectedBot,
          customElo,
          playerColor,
          gameMode,
          whitePlayerName,
          blackPlayerName,
          autoFlipBoard,
        },
      });

      setPhase('game');
      return;
    }

    if (!isOnline && gameMode === 'bot') {
      window.alert('You are offline. Game progress will not be saved.');
    }

    // Generate a gameId and put it in the URL like online games
    const gameId = initialGameId || generateGameId();

    const botName = selectedBot.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot.name;
    const botElo = selectedBot.id === 'custom' ? customElo : selectedBot.rating;

    if (isOnline && gameMode === 'bot') {
      try {
        await api.createLocalGame({
          gameCode: gameId,
          userId: user.id,
          username: user.username,
          opponentName: botName,
          opponentElo: botElo,
          playerColor: playerColor === 'w' ? 'white' : 'black',
        });
      } catch (error) {
        console.error('[Play] Failed to create local game:', error);
      }
    }

    const passParam = gameMode === 'pass' ? '&variant=pass' : '';
    navigate(`/game/${gameId}?mode=local${passParam}`, {
      replace: Boolean(initialGameId),
      state: {
        selectedBot,
        customElo,
        playerColor,
        gameMode,
        whitePlayerName,
        blackPlayerName,
        autoFlipBoard,
      },
    });

    setPhase('game');
  }

  const gameRef = useRef(null);
  const [uiState, setUiState] = useState({ canUndo: false, isThinking: false, gameStatus: 'playing', showHints: true });

  function handleSetup() {
    // Back to bot selection. We also reset the URL back to /play.
    setPhase('setup');
    const modeParam = gameMode === 'pass' ? '?mode=pass' : '';
    navigate(`/play${modeParam}`, { replace: true });
  }

  function handleNewGame() {
    gameRef.current?.newGame?.();
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

  const canSetup = uiState.gameStatus && uiState.gameStatus !== 'playing';
  const canReview = uiState.gameStatus === 'checkmate' || uiState.gameStatus === 'resigned';

  return (
    <div className="play-page">
      {phase === 'setup' ? (
        <PlaySetup
          selectedBot={selectedBot}
          onSelectBot={setSelectedBot}
          customElo={customElo}
          onCustomEloChange={setCustomElo}
          playerColor={playerColor}
          onSelectColor={setPlayerColor}
          onStart={handleStart}
          gameMode={gameMode}
          onModeChange={setGameMode}
          whitePlayerName={whitePlayerName}
          blackPlayerName={blackPlayerName}
          onWhiteNameChange={setWhitePlayerName}
          onBlackNameChange={setBlackPlayerName}
          autoFlip={autoFlipBoard}
          onAutoFlipChange={setAutoFlipBoard}
        />
      ) : (
        <>
          <ChessGame
            ref={gameRef}
            initialGameId={initialGameId}
            initialSelectedBot={selectedBot}
            initialCustomElo={customElo}
            initialBoardOrientation={boardOrientation}
            initialPlayerColor={playerColor}
            gameMode={gameMode}
            passAndPlayConfig={{
              whitePlayerName,
              blackPlayerName,
              autoFlipBoard,
            }}
            onUiStateChange={setUiState}
          />
          <GameBottomBar
            onSetup={handleSetup}
            canSetup={canSetup}
            onNewGame={handleNewGame}
            onUndo={handleUndo}
            onFlipBoard={handleFlipBoard}
            onHint={handleHint}
            onResign={handleResign}
            onReview={handleReview}
            canUndo={uiState.canUndo}
            isThinking={uiState.isThinking}
            showHints={settings.showHints}
            canReview={canReview}
          />
        </>
      )}
    </div>
  );
}
