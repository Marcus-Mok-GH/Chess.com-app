import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading, isOnline } = useUser()
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    // Redirect to landing if not logged in (but wait for loading to complete)
    if (!isLoading && !isLoggedIn) {
      navigate('/', { replace: true })
    }
  }, [isLoggedIn, isLoading, navigate])

  useEffect(() => {
    // Set time-based greeting
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 18) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  // Show loading state while checking auth
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

  if (!user) return null

  const winRate = user.gamesPlayed > 0 
    ? ((user.wins / user.gamesPlayed) * 100).toFixed(1)
    : 0

  return (
    <div className="home-page">
      <div className="home-container">
        {/* Welcome Section */}
        <section className="welcome-section">
          <h1 className="welcome-title">
            {greeting}, <span className="username-highlight">{user.username}</span>!
          </h1>
          <p className="welcome-subtitle">Ready for your next game?</p>
        </section>

        {/* Stats Overview */}
        <section className="stats-overview">
          <div className="stat-card elo-card">
            <div className="stat-icon">⭐</div>
            <div className="stat-content">
              <div className="stat-label">Current Rating</div>
              <div className="stat-value">{user.elo}</div>
            </div>
          </div>

          <div className="stat-card games-card">
            <div className="stat-icon">🎮</div>
            <div className="stat-content">
              <div className="stat-label">Games Played</div>
              <div className="stat-value">{user.gamesPlayed || 0}</div>
            </div>
          </div>

          <div className="stat-card winrate-card">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value">{winRate}%</div>
            </div>
          </div>
        </section>

        {/* Detailed Stats */}
        <section className="detailed-stats">
          <h2 className="section-title">Your Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item win-stat">
              <span className="stat-number">{user.wins || 0}</span>
              <span className="stat-text">Wins</span>
            </div>
            <div className="stat-item draw-stat">
              <span className="stat-number">{user.draws || 0}</span>
              <span className="stat-text">Draws</span>
            </div>
            <div className="stat-item loss-stat">
              <span className="stat-number">{user.losses || 0}</span>
              <span className="stat-text">Losses</span>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="quick-actions">
          <h2 className="section-title">Quick Play</h2>
          <div className="action-cards">
            <button 
              className="action-card play-ai-card"
              onClick={() => navigate('/play')}
            >
              <div className="action-icon">🤖</div>
              <div className="action-content">
                <h3>Play vs AI</h3>
                <p>Challenge our chess bots at different skill levels</p>
              </div>
            </button>

            <button 
              className="action-card pass-play-card"
              onClick={() => navigate('/play?mode=pass')}
            >
              <div className="action-icon">🤝</div>
              <div className="action-content">
                <h3>Pass &amp; Play</h3>
                <p>Two players, one device. Perfect for couch battles</p>
              </div>
            </button>

            <button 
              className="action-card play-online-card"
              onClick={() => navigate('/online')}
              disabled={!isOnline}
            >
              <div className="action-icon">🌐</div>
              <div className="action-content">
                <h3>Play Online</h3>
                <p>
                  {isOnline 
                    ? 'Find a match against other players' 
                    : 'Unavailable while offline'}
                </p>
              </div>
              {!isOnline && <div className="card-badge">Offline</div>}
            </button>
          </div>
        </section>

        {/* Member Since */}
        {user.createdAt && (
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
