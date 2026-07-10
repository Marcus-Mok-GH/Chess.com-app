import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ChessBoard from '../components/ChessBoard'
import { Chess } from 'chess.js'
import { Cpu, Globe, BarChart3, BookOpen, TrendingUp, Settings2, Sparkles, Zap, Users, Gamepad2, ArrowRight } from 'lucide-react'
import './Landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { isLoggedIn, isOnline } = useUser()
  const [stats, setStats] = useState({
    registeredPlayers: 0,
    gamesRecorded: 0,
    livePlayers: 0,
  })

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
    { icon: Cpu, title: 'Play Computer', description: 'Challenge AI bots at any difficulty with Stockfish engine' },
    { icon: Globe, title: 'Play Online', description: 'Real-time matchmaking against players at your skill level' },
    { icon: BarChart3, title: 'Analysis Board', description: 'Analyse any game with Stockfish engine evaluation' },
    { icon: BookOpen, title: 'Game Archive', description: 'Review and replay all your past games' },
    { icon: TrendingUp, title: 'ELO Rating', description: 'Track your skill progression with a live rating system' },
    { icon: Settings2, title: 'Custom Settings', description: 'Personalise board themes, piece sets, and sounds' },
  ]

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />
      <main className="landing-hero">
        <div className="hero-wrapper">
          <div className="hero-visual">
            <div className="hero-visual-frame">
              <ChessBoard
                position={demoPosition}
                showCoordinates={false}
                boardTheme="green"
              />
              <div className="hero-visual-tag">
                <span className="dot" /> Live preview
              </div>
            </div>
          </div>

          <div className="hero-content">
            <div className="hero-eyebrow">
              <Sparkles size={14} />
              <span>The #1 chess experience, reimagined</span>
            </div>
            <h1 className="hero-title">
              Play Chess <span className="text-gradient-brand">Online</span>
              <br />
              Like a Grandmaster
            </h1>
            <p className="hero-subtitle">
              Battle 12+ AI personalities with attitude, climb the ranked ladder against real
              players, and analyse every move — all in one beautifully crafted interface.
            </p>

            <div className="hero-actions">
              <button
                className="btn-chess primary"
                onClick={() => navigate('/online')}
              >
                <div className="btn-icon-wrap">
                  <Globe size={22} />
                </div>
                <div className="btn-text">
                  <span className="btn-main-text">Play Online</span>
                  <span className="btn-sub-text">Match with someone at your level</span>
                </div>
                <ArrowRight className="btn-arrow" size={18} />
              </button>

              <button
                className="btn-chess secondary"
                onClick={() => navigate('/play')}
              >
                <div className="btn-icon-wrap secondary">
                  <Cpu size={22} />
                </div>
                <div className="btn-text">
                  <span className="btn-main-text">Play Computer</span>
                  <span className="btn-sub-text">Challenge our elite AI bots</span>
                </div>
                <ArrowRight className="btn-arrow" size={18} />
              </button>
            </div>

            <div className="hero-trust">
              <div className="hero-trust-item">
                <Zap size={14} />
                <span>No downloads</span>
              </div>
              <span className="hero-trust-dot" />
              <div className="hero-trust-item">
                <Users size={14} />
                <span>Free forever</span>
              </div>
              <span className="hero-trust-dot" />
              <div className="hero-trust-item">
                <Gamepad2 size={14} />
                <span>Play in 10 seconds</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <section className="features-section">
        <div className="section-container">
          <div className="section-head">
            <h2 className="features-title">Everything You Need to Master Chess</h2>
            <p className="section-subtitle">
              From your first move to tournament play — every tool, every opponent, right here.
            </p>
          </div>
          <div className="features-grid">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div className="feature-card card-surface" key={feature.title}>
                  <div className="feature-icon-wrap">
                    <Icon size={22} />
                  </div>
                  <h3 className="feature-card-title">{feature.title}</h3>
                  <p className="feature-card-description">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="stats-section">
        <div className="section-container">
          <div className="stats-grid">
            <div className="stat-card card-surface">
              <div className="stat-icon-wrap">
                <Users size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-number">{stats.livePlayers.toLocaleString()}</span>
                <span className="stat-label">Players Online</span>
              </div>
            </div>
            <div className="stat-card card-surface">
              <div className="stat-icon-wrap">
                <Gamepad2 size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-number">{stats.gamesRecorded.toLocaleString()}</span>
                <span className="stat-label">Games Today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 <a href="http://Chess.com">Chess.com</a> App. Inspired by the best.</p>
      </footer>
    </div>
  )
}
