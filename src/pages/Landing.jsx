import { useState, useEffect, useMemo, memo } from 'react'
import { api } from '../services/api'
import { useNavigate, Link } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import LoginModal from '../components/LoginModal'
import './Landing.css'

const FloatingPiece = memo(({ type, color, style }) => {
  const pieces = {
    wK: '/custom-pieces/wK.svg',
    wQ: '/custom-pieces/wQ.svg',
    wR: '/custom-pieces/wR.svg',
    wB: '/custom-pieces/wB.svg',
    wN: '/custom-pieces/wN.svg',
    wP: '/custom-pieces/wP.svg',
    bK: '/custom-pieces/bK.svg',
    bQ: '/custom-pieces/bQ.svg',
    bR: '/custom-pieces/bR.svg',
    bB: '/custom-pieces/bB.svg',
    bN: '/custom-pieces/bN.svg',
    bP: '/custom-pieces/bP.svg',
  }
  return (
    <img 
      src={pieces[`${color}${type}`]} 
      alt="" 
      className="floating-piece"
      style={style}
      loading="lazy"
    />
  )
})

export default function Landing() {
  const navigate = useNavigate()
  const { isLoggedIn, isLoading, isOnline } = useUser()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [stats, setStats] = useState({
    registeredPlayers: 0,
    gamesRecorded: 0,
    liveGames: 0,
    livePlayers: 0,
    serverUptimeSeconds: 0,
  })

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true })
    }
  }, [isLoggedIn, isLoading, navigate])


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

  const uptimeLabel = useMemo(() => {
    const hours = Math.floor((stats.serverUptimeSeconds || 0) / 3600)
    if (hours < 1) return 'Under 1h'
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }, [stats.serverUptimeSeconds])
  const handlePlayOnline = () => {
    if (!isOnline) return
    if (!isLoggedIn) {
      setShowLoginModal(true)
    } else {
      navigate('/online')
    }
  }

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-glow glow-1"></div>
        <div className="landing-glow glow-2"></div>
        <div className="landing-grid"></div>
      </div>

      <div className="landing-hero">
        <div className="hero-wrapper">
          <div className="hero-content">
            <div className="hero-badge">
              <span>New</span> Multi-engine Analysis Available
            </div>
            <h1 className="hero-title">Master the Art of Chess</h1>
            <p className="hero-subtitle">
              Experience the world's most sophisticated chess platform. Play against elite AI,
              climb the global rankings, and analyze your games with professional tools.
            </p>

            <div className="hero-actions">
              <button className="btn-premium primary" onClick={() => navigate('/play')}>
                <span>Play vs Computer</span>
                <span className="btn-arrow">→</span>
              </button>
              <button
                className={`btn-premium secondary ${!isOnline ? 'disabled' : ''}`}
                onClick={handlePlayOnline}
                disabled={!isOnline}
              >
                <span>Play Online</span>
                <span className="btn-icon">🌐</span>
              </button>
            </div>
          </div>

          <div className="hero-visual">
            <div className="chess-card-container">
              <div className="chess-card-bg"></div>
              <div className="chess-card-main">
                <div className="preview-board">
                  {useMemo(() => [...Array(64)].map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isLight = (row + col) % 2 === 0;
                    return (
                      <div key={i} className={`preview-square ${isLight ? 'light' : 'dark'}`}></div>
                    );
                  }), [])}
                </div>
              </div>
              <div className="floating-pieces-container">
                <FloatingPiece type="K" color="w" style={{ top: '10%', left: '15%', animationDelay: '0s' }} />
                <FloatingPiece type="Q" color="b" style={{ bottom: '20%', right: '10%', animationDelay: '1s' }} />
                <FloatingPiece type="N" color="w" style={{ top: '60%', left: '5%', animationDelay: '2s' }} />
                <FloatingPiece type="B" color="b" style={{ top: '5%', right: '20%', animationDelay: '0.5s' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-number">{stats.livePlayers.toLocaleString()}</span>
            <span className="stat-label">Players Online Now</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.registeredPlayers.toLocaleString()}</span>
            <span className="stat-label">Registered Players</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.gamesRecorded.toLocaleString()}</span>
            <span className="stat-label">Games Recorded</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{uptimeLabel}</span>
            <span className="stat-label">Server Uptime</span>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-header">
          <h2>Everything You Need to Win</h2>
          <p>Powerful features for players of all skill levels.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <span className="feature-icon">🤖</span>
            <h3>Next-Gen AI</h3>
            <p>Challenge bots ranging from beginners to Grandmasters, powered by Stockfish 16.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📊</span>
            <h3>Deep Analysis</h3>
            <p>Understand every mistake and brilliant move with our advanced game review system.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">⚡</span>
            <h3>Instant Play</h3>
            <p>Jump into a game in seconds with our lightning-fast matchmaking system.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">♟️ ChessPremium</div>
          <div className="footer-links">
            <Link to="/play">Play</Link>
            <Link to="/online">Online</Link>
            <Link to="/changelog">Updates</Link>
            <a href="#">Privacy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 ChessPremium. Built for the modern grandmaster.</p>
        </div>
      </footer>

      {showLoginModal && (
        <LoginModal 
          mode="friendly"
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => {
            setShowLoginModal(false)
            navigate('/online')
          }}
          onContinueAsGuest={() => {
            setShowLoginModal(false)
            navigate('/online')
          }}
        />
      )}
    </div>
  )
}
