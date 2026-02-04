import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import { normalizeMoveHistory } from '../engine/game/moveHistory';
import './GameHistory.css';

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getResultText(result) {
  switch (result) {
    case 'white': return 'White wins';
    case 'black': return 'Black wins';
    case 'draw': return 'Draw';
    default: return 'Unknown';
  }
}

export default function GameHistory() {
  const { user, isOnline } = useUser();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !isOnline) {
      setLoading(false);
      return;
    }

    const loadGames = async () => {
      try {
        const userGames = await api.getGameHistory(user.username);
        setGames(userGames);
      } catch (err) {
        setError('Failed to load game history');
        console.error('Error loading games:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGames();
  }, [user, isOnline]);

  const handleViewGame = (game) => {
    // Debug logging to help diagnose grey screen issues
    console.log('[GameHistory] Viewing game:', {
      gameCode: game.game_code,
      moveHistoryType: typeof game.move_history,
      moveHistoryIsArray: Array.isArray(game.move_history),
      moveHistoryLength: game.move_history?.length,
      moveHistoryRaw: game.move_history,
      result: game.result,
      gameMode: game.game_mode,
    });

    // Ensure move_history is an array before navigation
    let moveHistory = normalizeMoveHistory(game.move_history);

    // Navigate to analysis with the game data
    navigate(`/analysis/${game.game_code}`, {
      state: {
        moveHistory,
        gameId: game.game_code
      }
    });
  };

  if (!isOnline) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>Game History</h1>
          <div className="offline-message">
            <p>Game history is only available when online.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>Game History</h1>
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading your games...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>Game History</h1>
          <div className="error-message">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-history-page">
      <div className="game-history-container">
        <div className="game-history-header">
          <h1>Game History</h1>
          <p className="game-count">
            {games.length} game{games.length !== 1 ? 's' : ''} played
          </p>
        </div>

        {games.length === 0 ? (
          <div className="no-games">
            <p>No games played yet.</p>
            <p>Start playing to see your game history here!</p>
          </div>
        ) : (
          <div className="games-list">
            {games.map((game) => (
              <div key={game.game_code} className="game-item">
                <div className="game-info">
                  <div className="game-details">
                    <span className="game-code">{game.game_code}</span>
                    <span className="game-result">{getResultText(game.result)}</span>
                    <span className="game-mode">{game.game_mode}</span>
                  </div>
                  <div className="game-date">
                    {formatDate(game.created_at)}
                  </div>
                </div>
                <div className="game-actions">
                  <button
                    onClick={() => handleViewGame(game)}
                    className="view-game-btn"
                  >
                    View Game
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
