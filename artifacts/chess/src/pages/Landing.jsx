import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ChessBoard from '../components/ChessBoard'
import { Chess } from 'chess.js'
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
            <h1 className="hero-title">Play Chess Online on the #1 Site!</h1>
            
            <div className="hero-actions">
              <button
                className="btn-chess primary"
                onClick={() => navigate('/online')}
              >
                <span className="btn-icon">🌐</span>
                <div className="btn-text">
                  <span className="btn-main-text">Play Online</span>
                  <span className="btn-sub-text">Play with someone at your level</span>
                </div>
              </button>

              <button
                className="btn-chess secondary"
                onClick={() => navigate('/play')}
              >
                <span className="btn-icon">🤖</span>
                <div className="btn-text">
                  <span className="btn-main-text">Play Computer</span>
                  <span className="btn-sub-text">Challenge our elite AI bots</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

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