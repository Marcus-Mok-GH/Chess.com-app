import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import api from '../services/api';
import AccountRequired from '../components/AccountRequired';
import EloProgressChart from '../components/EloProgressChart';
import WinRateChart from '../components/WinRateChart';
import './GameHistory.css';
import { useI18n } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';
import { getActiveLocale } from '../i18n/translate';

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(getActiveLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getResultText(result, t) {
  switch (result) {
    case 'white': return t('White wins');
    case 'black': return t('Black wins');
    case 'draw': return t('Draw');
    default: return t('Unknown');
  }
}

export default function GameHistory() {
  const { t, tCount } = useI18n();
  const { user, isOnline, isLoggedIn } = useUser();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [eloHistory, setEloHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !isOnline) {
      setLoading(false);
      return;
    }

    const loadGameData = async () => {
      try {
        const [userGames, historyData] = await Promise.all([
          api.getGameHistory(user.id || user.username),
          api.getEloHistory(user.username, 500)
        ]);
        setGames(userGames);
        setEloHistory(historyData);
      } catch (err) {
        setError(tNow('Failed to load game history'));
        console.error('Error loading games:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGameData();
  }, [user, isOnline]);

  if (!isLoggedIn) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <div className="game-history-header">
            <h1>{t("Game History")}</h1>
          </div>
          <AccountRequired
            title={t("Your archive is tied to your account")}
            message={t("Game history and rating charts are stored per account. Log in to browse your games and reviews.")}
          />
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>{t("Game History")}</h1>
          <div className="offline-message">
            <p>{t("Game history is only available when online.")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>{t("Game History")}</h1>
          <div className="loading">
            <div className="spinner"></div>
            <p>{t("Loading your games...")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-history-page">
        <div className="game-history-container">
          <h1>{t("Game History")}</h1>
          <div className="error-message">
            <p>{t(error)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-history-page">
      <div className="game-history-container">
        <div className="game-history-header">
          <h1>{t("Game History")}</h1>
          <p className="game-count">
            {tCount(games.length, '{count} game played', '{count} games played')}
          </p>
        </div>

        {/* Stats Charts Section */}
        {eloHistory.length > 0 && (
          <div className="game-history-charts">
            <EloProgressChart history={eloHistory} currentElo={user.elo} />
            <WinRateChart history={eloHistory} />
          </div>
        )}

        {games.length === 0 ? (
          <div className="no-games">
            <p>{t("No games played yet.")}</p>
            <p>{t("Start playing to see your game history here!")}</p>
          </div>
        ) : (
          <div className="games-list">
            {games.map((game) => (
              <button
                key={game.game_code}
                type="button"
                className="game-item"
                onClick={() => navigate(`/review/${encodeURIComponent(game.game_code)}`)}
                aria-label={t('Review game {code} ({result})', { code: game.game_code, result: getResultText(game.result, t) })}
              >
                <div className="game-info">
                  <div className="game-details">
                    <span className="game-code">{game.game_code}</span>
                    <span className="game-result">{getResultText(game.result, t)}</span>
                    <span className="game-mode">{t(game.game_mode || 'friendly')}</span>
                  </div>
                  <div className="game-date">
                    {formatDate(game.created_at)}
                    <span className="game-review-hint">{t("Review →")}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
