import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ChessBoard from '../components/ChessBoard'
import { Chess } from 'chess.js'
import { PlayIcon, OnlineIcon, AnalysisIcon, ArchiveIcon, BoltIcon, RobotIcon } from '../components/Icons'
import './Landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { isLoggedIn, isOnline } = useUser()
  const [stats, setStats] = useState({
    registeredPlayers: 0,
    gamesRecorded: 0,
    livePlayers: 0,
  })

  // A nice instructive position for the landing page
  const demoPosition = useMemo(() => new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), [])

  useEffect(() => {
    let mounted = true
    const loadStats = async () => {
      try {
        const data = await api.getPublicStats()
        if (mounted) setStats(data)
      } catch (error) {
        console.warn('[Landing] Failed to load live stats:', error.message)
      }
    }
    loadStats()
    const intervalId = setInterval(loadStats, 30000)
    return () => {
      mounted = false
      clearInterval(intervalId)
    }
  }, [])

  const features = [
    { Icon: RobotIcon,     title: 'Play Computer',   description: 'Challenge AI bots at any difficulty with the Stockfish engine' },
    { Icon: OnlineIcon,    title: 'Play Online',     description: 'Real-time matchmaking against players at your skill level' },
    { Icon: AnalysisIcon,  title: 'Analysis Board',  description: 'Analyse any game with Stockfish engine evaluation' },
    { Icon: ArchiveIcon,   title: 'Game Archive',    description: 'Review and replay all your past games' },
    { Icon: BoltIcon,      title: 'Live ELO Rating', description: 'Track your skill progression with a live rating system' },
    { Icon: PlayIcon,      title: 'Custom Settings', description: 'Personalise board themes, piece sets, and sound effects' },
  ]

  return (
    <div className="landing">
      <main className="landing-hero">
        <div className="hero-wrapper">
          <div className="hero-visual">
            <ChessBoard
              position={demoPosition}
              showCoordinates={false}
              boardTheme="green"
            />
          </div>

          <div className="hero-content">
            <h1 className="hero-title">
              Play Chess<br />
              <span className="hero-title-accent">Online</span>
            </h1>
            <p className="hero-subtitle">
              Play with someone at your level. Or challenge the computer. It's free.
            </p>

            <div className="hero-actions">
              <button
                className="btn-chess primary"
                onClick={() => navigate('/online')}
              >
                <span className="btn-icon">
                  <OnlineIcon />
                </span>
                <div className="btn-text">
                  <span className="btn-main-text">Play Online</span>
                  <span className="btn-sub-text">Play with someone at your level</span>
                </div>
              </button>

              <button
                className="btn-chess secondary"
                onClick={() => navigate('/play')}
              >
                <span className="btn-icon">
                  <RobotIcon />
                </span>
                <div className="btn-text">
                  <span className="btn-main-text">Play Computer</span>
                  <span className="btn-sub-text">Challenge our elite AI bots</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      <section className="features-section">
        <h2 className="features-title">Everything You Need to Master Chess</h2>
        <div className="features-grid">
          {features.map(({ Icon, title, description }) => (
            <div className="feature-card" key={title}>
              <span className="feature-icon"><Icon /></span>
              <h3 className="feature-card-title">{title}</h3>
              <p className="feature-card-description">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-number">{stats.livePlayers.toLocaleString()}</span>
            <span className="stat-label">Players Online</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.gamesRecorded.toLocaleString()}</span>
            <span className="stat-label">Games Today</span>
          </div>
        </div>
      </section>

      <footer className="landing-footer" style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
        <p>© 2026 chess.com-app. Inspired by the best.</p>
      </footer>
    </div>
  )
}
