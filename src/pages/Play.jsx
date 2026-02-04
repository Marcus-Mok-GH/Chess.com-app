import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChessGame from '../components/ChessGame';
import { useSettings } from '../contexts/SettingsContext';
import { useUser } from '../contexts/UserContext';
import GameBottomBar from '../components/GameBottomBar';
import PlaySetup from '../components/PlaySetup';
import { BOTS } from '../engine/bots/bots';
import { generateGameId } from '../engine/game/gameId';
import api from '../services/api';

import './Play.css';

export default function Play({ initialGameId = null, initialSetup = null }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, isOnline } = useUser();

  const [phase, setPhase] = useState(initialGameId ? 'game' : 'setup');
  const [playerColor, setPlayerColor] = useState(initialSetup?.playerColor || 'w');
  const [customElo, setCustomElo] = useState(initialSetup?.customElo ?? 1000);
  const [selectedBot, setSelectedBot] = useState(() => initialSetup?.selectedBot || BOTS.find((b) => b.id === 'nelson') || BOTS[0]);

  const boardOrientation = useMemo(() => (playerColor === 'w' ? 'white' : 'black'), [playerColor]);

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
      navigate(`/game/${gameId}?mode=local`, {
        replace: Boolean(initialGameId),
        state: {
          selectedBot,
          customElo,
          playerColor,
        },
      });

      setPhase('game');
      return;
    }

    if (!isOnline) {
      window.alert('You are offline. Game progress will not be saved.');
    }

    // Generate a gameId and put it in the URL like online games
    const gameId = initialGameId || generateGameId();

    const botName = selectedBot.id === 'custom' ? `Custom Bot (${customElo})` : selectedBot.name;
    const botElo = selectedBot.id === 'custom' ? customElo : selectedBot.rating;

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
      replace: Boolean(initialGameId),
      state: {
        selectedBot,
        customElo,
        playerColor,
      },
    });

    setPhase('game');
  }

  const gameRef = useRef(null);
  const [uiState, setUiState] = useState({ canUndo: false, isThinking: false, gameStatus: 'playing', showHints: true });

  function handleSetup() {
    // Back to bot selection. We also reset the URL back to /play.
    setPhase('setup');
    navigate('/play', { replace: true });
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
