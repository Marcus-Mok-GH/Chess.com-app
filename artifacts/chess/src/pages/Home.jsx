import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { RobotIcon, OnlineIcon, ArchiveIcon, AnalysisIcon, BoltIcon, PlayIcon } from '../components/Icons'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const { user, isLoggedIn, isLoading, isOnline } = useUser()
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    if (!isLoading && !isLoggedIn) navigate('/', { replace: true })
  }, [isLoggedIn, isLoading, navigate])

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
          <div className="home-loading"><p>Loading...</p></div>
        </div>
      </div>
    )
  }

  if (!user) return null

  const winRate = user.gamesPlayed > 0
    ? ((user.wins / user.gamesPlayed) * 100).toFixed(1)
    : 0

  const actions = [
    { Icon: RobotIcon,    title: 'Play vs AI',      desc: 'Challenge our chess bots at different skill levels',         onClick: () => navigate('/play'),     disabled: false },
    { Icon: OnlineIcon,   title: 'Play Online',     desc: isOnline ? 'Find a match against other players' : 'Unavailable while offline', onClick: () => navigate('/online'), disabled: !isOnline, badge: !isOnline ? 'Offline' : null },
    { Icon: ArchiveIcon,  title: 'Game Archive',    desc: 'Review and replay your past games',                          onClick: () => navigate('/history'),  disabled: false },
    { Icon: AnalysisIcon, title: 'Analysis Board',  desc: 'Analyse any position with Stockfish evaluation',            onClick: () => navigate('/analysis'), disabled: false },
  ]

  return (
    <div className="home-page">
      <div className="home-container">
        {/* Welcome */}
        <section className="welcome-section">
          <h1 className="welcome-title">
            {greeting}, <span className="username-highlight">{user.username}</span>!
          </h1>
          <p className="welcome-subtitle">Ready for your next game?</p>
        </section>

        {/* Stats Overview */}
        <section className="stats-overview">
          <div className="stat-card elo-card">
            <div className="stat-icon"><BoltIcon /></div>
            <div className="stat-content">
              <div className="stat-label">Current Rating</div>
              <div className="stat-value">{user.elo}</div>
            </div>
          </div>
          <div className="stat-card games-card">
            <div className="stat-icon"><PlayIcon /></div>
            <div className="stat-content">
              <div className="stat-label">Games Played</div>
              <div className="stat-value">{user.gamesPlayed || 0}</div>
            </div>
          </div>
          <div className="stat-card winrate-card">
            <div className="stat-icon" style={{ color: 'var(--primary)' }}>🏆</div>
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
            {actions.map(({ Icon, title, desc, onClick, disabled, badge }) => (
              <button
                key={title}
                className={`action-card ${disabled ? 'is-disabled' : ''}`}
                onClick={onClick}
                disabled={disabled}
              >
                <div className="action-icon"><Icon /></div>
                <div className="action-content">
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
                {badge && <div className="card-badge">{badge}</div>}
              </button>
            ))}
          </div>
        </section>

        {user.createdAt && (
          <section className="member-info">
            <p className="member-text">
              Member since {new Date(user.createdAt).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
