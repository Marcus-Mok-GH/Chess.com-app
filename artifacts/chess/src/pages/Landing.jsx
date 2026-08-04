import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useNavigate, Link } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ChessBoard from '../components/ChessBoard'
import { Chess } from 'chess.js'
import {
  Cpu,
  Globe,
  BarChart3,
  BookOpen,
  TrendingUp,
  Settings2,
  Users,
  Gamepad2,
  ArrowRight,
  Crown,
  GraduationCap,
  Bot,
  Play,
  Puzzle,
  Eye,
  UsersRound,
  LogIn,
  UserPlus,
  Search,
  Menu,
  X,
  Sparkles,
  Pencil,
} from 'lucide-react'
import './Landing.css'

// Left sidebar navigation — mirrors chess.com's primary nav
const NAV_LINKS = [
  { icon: Play, label: 'Play', to: '/play' },
  { icon: Puzzle, label: 'Puzzles', to: '/puzzles' },
  { icon: GraduationCap, label: 'Learn', to: '/analysis' },
  { icon: TrendingUp, label: 'Train', to: '/history' },
  { icon: Eye, label: 'Watch', to: '/history' },
  { icon: UsersRound, label: 'Community', to: '/history' },
]

// Other-rail links (chess.com collapses less-used destinations here)
const OTHER_LINKS = [
  { label: 'Analysis Board', to: '/analysis' },
  { label: 'Game Archive', to: '/history' },
  { label: 'Settings', to: '/settings' },
  { label: 'Terms', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
]

// Alternating image/text feature blocks (chess.com style)
const FEATURE_BLOCKS = [
  {
    icon: GraduationCap,
    eyebrow: 'Lessons',
    title: 'Improve Your Game with Lessons',
    description:
      'Step through opening principles, middlegame plans, and endgame technique with guided commentary on every position.',
    to: '/analysis',
    cta: 'Start a Lesson',
    boardTheme: 'green',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    flip: false,
  },
  {
    icon: Bot,
    eyebrow: 'Bots',
    title: 'Play Chess Bots',
    description:
      'Challenge 12+ AI personalities — from beginner-friendly Martin to ruthless Stockfish. Every difficulty, every time control.',
    to: '/play',
    cta: 'Challenge a Bot',
    boardTheme: 'brown',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    flip: true,
  },
  {
    icon: Puzzle,
    eyebrow: 'Puzzles',
    title: 'Level Up With Chess Puzzles',
    description:
      'Sharpen your tactical vision with thousands of rated puzzles. Spot the combination, find the win, climb the rating ladder.',
    to: '/puzzles',
    cta: 'Solve a Puzzle',
    boardTheme: 'blue',
    fen: 'r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R b KQkq - 1 9',
    flip: false,
  },
  {
    icon: Eye,
    eyebrow: 'Watch',
    title: 'Watch the Best in the World Compete',
    description:
      'Replay master games move-by-move with Stockfish evaluation, negatives vs threats, and natural-language commentary.',
    to: '/history',
    cta: 'Watch Chess',
    boardTheme: 'green',
    fen: 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/2P5/2N1PN2/PP3PPP/R1BQ1RK1 b - - 4 8',
    flip: true,
  },
]

const FEATURE_POSITIONS = FEATURE_BLOCKS.map(
  (block) => new Chess(block.fen)
)

const SOCIAL_LINKS = [
  { label: 'TikTok', href: '#' },
  { label: 'X', href: '#' },
  { label: 'YouTube', href: '#' },
  { label: 'Twitch', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'Discord', href: '#' },
]

const FOOTER_LINKS = [
  { label: 'Support', href: 'mailto:support@playchess.app' },
  { label: 'Chess Terms', to: '/terms' },
  { label: 'About', to: '/' },
  { label: 'Jobs', href: 'mailto:jobs@playchess.app' },
  { label: 'Developers', href: 'https://github.com/Marcus-Mok-GH/Chess.com-app' },
  { label: 'User Agreement', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Cheating & Fair Play', to: '/terms' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { isLoggedIn, isOnline } = useUser()
  const [stats, setStats] = useState({
    registeredPlayers: 0,
    gamesRecorded: 0,
    livePlayers: 0,
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Hero position — a sharp middlegame snapshot
  const demoPosition = useMemo(
    () => new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'),
    [],
  )

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

  const goTo = (path) => {
    setMobileNavOpen(false)
    navigate(path)
  }

  return (
    <div className={`landing ${mobileNavOpen ? 'nav-open' : ''}`}>
      {/* === Left sidebar — chess.com style nav rail === */}
      <aside className="landing-sidebar" aria-label="Primary navigation">
        <Link to="/" className="sidebar-logo" onClick={() => setMobileNavOpen(false)}>
          <span className="sidebar-logo-icon">
            <Crown size={22} />
          </span>
          <span className="sidebar-logo-text">PlayChess</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main">
          {NAV_LINKS.map(({ icon: Icon, label, to }) => (
            <button
              key={label}
              className="sidebar-nav-link"
              onClick={() => goTo(to)}
              type="button"
            >
              <Icon size={22} className="sidebar-nav-icon" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* "Other" collapsible group — mirrors chess.com's overflow rail */}
        <nav className="sidebar-nav sidebar-nav-other" aria-label="More">
          {OTHER_LINKS.map((l) => (
            <button
              key={l.label}
              className="sidebar-nav-link sidebar-nav-link-sub"
              onClick={() => goTo(l.to)}
              type="button"
            >
              <span className="sidebar-nav-bullet" />
              <span>{l.label}</span>
            </button>
          ))}
        </nav>

        <button className="sidebar-search" type="button" aria-label="Search">
          <Search size={16} />
          <span>Search</span>
          <span className="sidebar-search-shortcut">/</span>
        </button>

        {/* Live-player count — chess.com shows a green online indicator */}
        <div className="sidebar-online" title="Players online now">
          <span className="sidebar-online-dot" />
          <span>{stats.livePlayers.toLocaleString()} online</span>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-auth">
          {isLoggedIn ? (
            <button className="btn-green btn-block" onClick={() => goTo('/home')} type="button">
              Go to Dashboard
              <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button
                className="btn-green btn-block"
                onClick={() => goTo('/login')}
                type="button"
              >
                <UserPlus size={16} />
                Sign Up
              </button>
              <button
                className="btn-ghost btn-block"
                onClick={() => goTo('/login')}
                type="button"
              >
                <LogIn size={16} />
                Log In
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile nav backdrop */}
      <button
        className="landing-nav-backdrop"
        aria-label="Close menu"
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
      />

      {/* Mobile nav toggle */}
      <button
        className="landing-burger"
        type="button"
        onClick={() => setMobileNavOpen((v) => !v)}
        aria-label="Toggle navigation"
        aria-expanded={mobileNavOpen}
      >
        {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <main className="landing-main">
        {/* === Hero — board on the left, "Play Chess Online on the #1 Site!" + Get Started on the right === */}
        <section className="hero">
          <div className="hero-board">
            <div className="hero-board-frame">
              <ChessBoard position={demoPosition} showCoordinates={false} boardTheme="green" />
            </div>
            <div className="hero-board-live">
              <span className="dot" /> Live preview
            </div>
          </div>

          <div className="hero-copy">
            <h1 className="hero-title">
              Play Chess Online on the #<span className="hero-title-num">1</span> Site!
            </h1>
            <p className="hero-subtitle">
              Battle 12+ AI personalities with attitude, climb the ranked ladder against real
              players, and analyse every move — all in one beautifully crafted interface.{' '}
              <span className="hero-online">
                {stats.livePlayers.toLocaleString()} playing now
              </span>
            </p>

            <div className="hero-actions">
              <button
                className="btn-green btn-lg"
                onClick={() => goTo(isLoggedIn ? '/online' : '/login')}
                type="button"
              >
                Get Started
                <ArrowRight size={18} />
              </button>
              <button
                className="btn-ghost btn-lg"
                onClick={() => goTo('/play')}
                type="button"
              >
                <Cpu size={18} />
                Play a Bot
              </button>
            </div>
          </div>
        </section>

        {/* === Live stats bar === */}
        {stats.livePlayers > 0 || stats.gamesRecorded > 0 ? (
          <section className="stats-bar" aria-label="Live stats">
            <div className="stat-item">
              <Users size={16} />
              <strong>{stats.livePlayers.toLocaleString()}</strong>
              <span>Playing Now</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <Gamepad2 size={16} />
              <strong>{stats.gamesRecorded.toLocaleString()}</strong>
              <span>Games Recorded</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <UsersRound size={16} />
              <strong>{stats.registeredPlayers.toLocaleString()}</strong>
              <span>Members</span>
            </div>
          </section>
        ) : null}

        {/* === Alternating image/text feature blocks === */}
        <section className="feature-blocks">
          {FEATURE_BLOCKS.map((block, index) => {
            const Icon = block.icon
            const position = FEATURE_POSITIONS[index]
            return (
              <article className={`feature-block ${block.flip ? 'flip' : ''}`} key={block.title}>
                <div className="feature-block-visual">
                  <div className="feature-block-board">
                    <ChessBoard
                      position={position}
                      showCoordinates={false}
                      boardTheme={block.boardTheme}
                    />
                    <span className="feature-block-board-tag">
                      <Icon size={14} /> {block.eyebrow}
                    </span>
                  </div>
                </div>

                <div className="feature-block-text">
                  <span className="feature-block-eyebrow">
                    <Icon size={14} /> {block.eyebrow}
                  </span>
                  <h2 className="feature-block-title">{block.title}</h2>
                  <p className="feature-block-desc">{block.description}</p>
                  <button
                    className="btn-link feature-block-cta"
                    onClick={() => goTo(block.to)}
                    type="button"
                  >
                    {block.cta}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        {/* === App promo (mirrors chess.com's mobile app block) === */}
        <section className="app-promo">
          <div className="app-promo-content">
            <Sparkles size={20} className="app-promo-icon" />
            <div>
              <h3 className="app-promo-title">Play Anywhere with the PlayChess App</h3>
              <p className="app-promo-sub">
                Free, fast, and your games sync across every device. No download required — just
                open this site and start playing.
              </p>
            </div>
          </div>
          <div className="app-promo-actions">
            <button
              className="btn-ghost btn-lg"
              onClick={() => goTo(isLoggedIn ? '/home' : '/login')}
              type="button"
            >
              {isLoggedIn ? 'Open Dashboard' : 'Get Started'}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>

        {/* === Final CTA === */}
        <section className="final-cta">
          <h2 className="final-cta-title">Learn, Play, and Have Fun!</h2>
          <button
            className="btn-green btn-xl"
            onClick={() => goTo(isLoggedIn ? '/online' : '/login')}
            type="button"
          >
            Get Started
            <ArrowRight size={20} />
          </button>
        </section>

        {/* === Footer === */}
        <footer className="landing-footer">
          <div className="footer-links">
            {FOOTER_LINKS.map((l) =>
              l.to ? (
                <Link key={l.label} to={l.to} className="footer-link">
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="footer-link">
                  {l.label}
                </a>
              ),
            )}
          </div>

          <p className="footer-copyright">
            PlayChess · © 2026 · Inspired by{' '}
            <a href="https://www.chess.com" target="_blank" rel="noopener noreferrer">
              Chess.com
            </a>
          </p>

          <div className="footer-social">
            {SOCIAL_LINKS.map((s) => (
              <a key={s.label} href={s.href} className="footer-social-btn" aria-label={s.label}>
                {s.label[0]}
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  )
}
