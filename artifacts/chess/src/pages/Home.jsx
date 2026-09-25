import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { Wifi, WifiOff, Play, ArrowUpRight } from 'lucide-react'
import api from '../services/api'
import DailyPuzzleStreak from '../components/DailyPuzzleStreak'
import AccountRequired from '../components/AccountRequired'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading, isOnline } = useUser()
  const [greeting, setGreeting] = useState('')
  const [incompleteGame, setIncompleteGame] = useState(null)

  useEffect(() => {
    if (!user?.username || !isOnline) {
      setIncompleteGame(null)
      return undefined
    }

    let cancelled = false
    api.getLatestIncompleteLocalGame(user.username)
      .then((game) => {
        if (!cancelled) setIncompleteGame(game)
      })
      .catch((error) => {
        console.error('[Home] Failed to load incomplete local game:', error)
        if (!cancelled) setIncompleteGame(null)
      })

    return () => { cancelled = true }
  }, [user?.username, isOnline])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  if (isLoading) {
    return (
      <div className="home-page">
        <div className="home-container">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p style={{ color: 'var(--chesscom-text-dim)' }}>Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  const winRate = user?.gamesPlayed > 0
    ? ((user.wins / user.gamesPlayed) * 100).toFixed(1)
    : 0

  return (
    <div className="home-page">
      <div className="home-container">
        {/* Welcome Section */}
        <section className="welcome-section">
          <div className="welcome-eyebrow">
            {isOnline ? (
              <>
                <Wifi size={14} />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span>Offline</span>
              </>
            )}
          </div>
          <h1 className="welcome-title">
            {isLoggedIn && user ? (
              <>{greeting}, <span className="username-highlight">{user.username}</span></>
            ) : (
              'Welcome to PlayChess'
            )}
          </h1>
          <p className="welcome-subtitle">Ready for your next game?</p>
        </section>

        {/* Daily Puzzle Streak */}
        <section className="daily-streak-section">
          <DailyPuzzleStreak linkToPuzzles />
        </section>

        {/* Stats Overview */}
        {isLoggedIn && user ? (
          <section className="stats-overview">
            <div className="stat-card card-surface">
              <div className="stat-content">
                <div className="stat-label">Rating</div>
                <div className="stat-value">{user.elo}</div>
              </div>
            </div>

            <div className="stat-card card-surface">
              <div className="stat-content">
                <div className="stat-label">Rated Games</div>
                <div className="stat-value">{user.gamesPlayed || 0}</div>
              </div>
            </div>

            <div className="stat-card card-surface">
              <div className="stat-content">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value">{winRate}%</div>
              </div>
            </div>
          </section>
        ) : (
          <AccountRequired
            title="Your stats live in your account"
            message="Rating, games played, and win rate are tied to your account. Log in to see them here."
          />
        )}

        {/* Detailed Stats */}
        {isLoggedIn && user && (
          <section className="detailed-stats">
            <h2 className="section-title">Your Statistics</h2>
            <div className="stats-grid">
              <div className="stat-item card-surface win-stat">
                <span className="stat-number">{user.wins || 0}</span>
                <span className="stat-text">Wins</span>
              </div>
              <div className="stat-item card-surface draw-stat">
                <span className="stat-number">{user.draws || 0}</span>
                <span className="stat-text">Draws</span>
              </div>
              <div className="stat-item card-surface loss-stat">
                <span className="stat-number">{user.losses || 0}</span>
                <span className="stat-text">Losses</span>
              </div>
            </div>
          </section>
        )}

        {incompleteGame && (
          <section className="resume-game-section">
            <div className="resume-game-card card-surface">
              <div className="resume-game-copy">
                <div className="resume-game-eyebrow"><Play size={14} /> In progress</div>
                <h2>Complete this game?</h2>
                <p>Resume your game against {String(incompleteGame.white_player_id) === String(user.id) ? incompleteGame.black_player_name : incompleteGame.white_player_name}.</p>
              </div>
              <button
                className="resume-game-button"
                onClick={() => navigate(`/game/${incompleteGame.game_code}?mode=local`)}
              >
                Resume game
                <ArrowUpRight size={18} />
              </button>
            </div>
          </section>
        )}

        {/* Quick Actions */}
        <section className="quick-actions">
          <h2 className="section-title">Quick Play</h2>
          <div className="action-cards">
            <button
              className="action-card card-surface"
              onClick={() => navigate('/play')}
            >
              <div className="action-content">
                <h3>Play a bot</h3>
                <p>Pick an opponent at any strength, from 400 up</p>
              </div>
              <ArrowUpRight className="action-arrow" size={18} />
            </button>

            <button
              className="action-card card-surface"
              onClick={() => navigate('/puzzles')}
            >
              <div className="action-content">
                <h3>Puzzles</h3>
                <p>Work through the lesson scheme, one tactic at a time</p>
              </div>
              <ArrowUpRight className="action-arrow" size={18} />
            </button>

            <button
              className="action-card card-surface"
              onClick={() => navigate('/changelog')}
            >
              <div className="action-content">
                <h3>Changelog</h3>
                <p>What's new and what got fixed</p>
              </div>
              <ArrowUpRight className="action-arrow" size={18} />
            </button>

            <button
              className="action-card card-surface"
              onClick={() => navigate('/openings')}
            >
              <div className="action-content">
                <h3>Openings</h3>
                <p>Follow main lines and check the move stats</p>
              </div>
              <ArrowUpRight className="action-arrow" size={18} />
            </button>

            <button
              className="action-card card-surface play-online-card"
              onClick={() => navigate('/online')}
              disabled={!isOnline}
            >
              <div className="action-content">
                <h3>Play online</h3>
                <p>
                  {isOnline
                    ? 'Find a rated opponent at your level'
                    : 'Connect to play online'}
                </p>
              </div>
              {!isOnline ? (
                <span className="card-badge">Offline</span>
              ) : (
                <ArrowUpRight className="action-arrow" size={18} />
              )}
            </button>
          </div>
        </section>

        {isLoggedIn && user?.createdAt && (
          <section className="member-info">
            <p className="member-text">
              Member since {new Date(user.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
