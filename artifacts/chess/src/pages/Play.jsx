import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const { settings } = useSettings();
  const { user, isLoggedIn, isOnline } = useUser();

  const resumedFromStorage = useMemo(
    () => (initialGameId ? loadLocalGame(initialGameId) : null),
    [initialGameId],
  );

  const effectiveGameId = initialGameId ? String(initialGameId).toUpperCase() : null;

  const mergedSetup = useMemo(() => {
    if (initialSetup?.selectedBot || initialSetup?.playerColor) {
      return {
        selectedBot: initialSetup.selectedBot,
        customElo: initialSetup.customElo,
        playerColor: initialSetup.playerColor,
      };
    }
    if (resumedFromStorage) {
      return {
        selectedBot: botFromSetup(resumedFromStorage),
        customElo: resumedFromStorage.customElo ?? 1000,
        playerColor: resumedFromStorage.playerColor || 'w',
      };
    }
    return null;
  }, [initialSetup, resumedFromStorage]);

  const [phase, setPhase] = useState(effectiveGameId ? 'game' : 'setup');
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
    if (!user) {
      const gameId = activeGameId || generateGameId();
      // Seed localStorage so a mid-game refresh restores setup + empty board
      saveLocalGame({
        gameId,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moveHistory: [],
        playerColor,
        boardOrientation: playerColor === 'w' ? 'white' : 'black',
        botId: selectedBot.id,
        botName: selectedBot.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot.name,
        customElo,
        result: 'in_progress',
      });

      navigate(`/game/${gameId}?mode=local`, {
        replace: Boolean(activeGameId),
        state: {
          selectedBot,
          customElo,
          playerColor,
        },
      });

      setActiveGameId(gameId);
      setPhase('game');
      return;
    }

    if (!isOnline) {
      window.alert('You are offline. Game progress will be saved locally on this device.');
    }

    const gameId = activeGameId || generateGameId();

    const botName = selectedBot.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot.name;
    const botElo = selectedBot.id === 'custom' ? customElo : selectedBot.rating;

    saveLocalGame({
      gameId,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveHistory: [],
      playerColor,
      boardOrientation: playerColor === 'w' ? 'white' : 'black',
      botId: selectedBot.id,
      botName,
      customElo,
      result: 'in_progress',
    });

    if (isOnline) {
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

    navigate(`/game/${gameId}?mode=local`, {
      replace: Boolean(activeGameId),
      state: {
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
