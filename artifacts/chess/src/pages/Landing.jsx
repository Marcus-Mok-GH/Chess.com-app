import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useNavigate, Link } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { getActiveLocale } from '../i18n/translate'
import ChessBoard from '../components/ChessBoard'
import { Chess } from 'chess.js'
import {
  Cpu,
  TrendingUp,
  Users,
  Gamepad2,
  ArrowRight,
  Crown,
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
} from 'lucide-react'
import './Landing.css'
import { useT } from '../i18n/I18nContext';

// Left sidebar navigation — mirrors chess.com's primary nav
const NAV_LINKS = [
  { icon: Play, label: 'Play', to: '/play' },
  { icon: Puzzle, label: 'Puzzles', to: '/puzzles' },
  { icon: TrendingUp, label: 'Train', to: '/history' },
  { icon: Eye, label: 'Watch', to: '/history' },
  { icon: UsersRound, label: 'Community', to: '/history' },
]

// Other-rail links (chess.com collapses less-used destinations here)
const OTHER_LINKS = [
  { label: 'Game Archive', to: '/history' },
  { label: 'Settings', to: '/settings' },
  { label: 'Terms', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
]

const DEMO_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'

const FEATURES = [
  {
    icon: Bot,
    title: 'Bots',
    description: 'Choose a difficulty',
    to: '/play',
    cta: 'Play a bot',
  },
  {
    icon: Puzzle,
    title: 'Puzzles',
    description: 'Practice chess tactics',
    to: '/puzzles',
    cta: 'Solve a puzzle',
  },
  {
    icon: Eye,
    title: 'Archive',
    description: 'Review your past games',
    to: '/history',
    cta: 'Open the archive',
  },
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

// The rank numeral keeps its own accent colour, so the sentence is translated
// whole and split on a sentinel that no translator can type or move. Languages
// that put "#1" somewhere other than the front of the sentence (Tamil, Hindi)
// then read naturally instead of being stitched together from fragments.
const HERO_RANK = '1';
const HERO_RANK_SLOT = '\u0000';
const HERO_TITLE_KEY = 'Play Chess Online on the #{n} Site!';

export default function Landing() {
  const t = useT();
  const [heroTitleBefore, heroTitleAfter = ''] = t(HERO_TITLE_KEY, {
    n: HERO_RANK_SLOT,
  }).split(HERO_RANK_SLOT);
  const navigate = useNavigate()
  const { isLoggedIn } = useUser()
  const [stats, setStats] = useState({
    registeredPlayers: 0,
    gamesRecorded: 0,
    livePlayers: 0,
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Hero position — a sharp middlegame snapshot
  const [demoFen, setDemoFen] = useState(DEMO_FEN)
  const [selectedDemoSquare, setSelectedDemoSquare] = useState(null)

  const handleDemoPieceDrop = (sourceSquare, targetSquare) => {
    const game = new Chess(demoFen)

    try {
      game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    } catch {
      return false
    }

    setDemoFen(game.fen())
    setSelectedDemoSquare(null)
    return true
  }

  const handleDemoSquareClick = (square) => {
    const game = new Chess(demoFen)
    const piece = game.get(square)

    if (!selectedDemoSquare) {
      if (piece && piece.color === game.turn()) setSelectedDemoSquare(square)
      return
    }

    if (square === selectedDemoSquare) {
      setSelectedDemoSquare(null)
      return
    }

    if (handleDemoPieceDrop(selectedDemoSquare, square)) return

    setSelectedDemoSquare(piece && piece.color === game.turn() ? square : null)
  }

  const demoSquareStyles = useMemo(
    () =>
      selectedDemoSquare
        ? {
            [selectedDemoSquare]: {
              boxShadow: 'inset 0 0 0 4px rgba(255, 214, 77, 0.9)',
            },
          }
        : {},
    [selectedDemoSquare],
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
      <aside className="landing-sidebar" aria-label={t("Primary navigation")}>
        <Link to="/" className="sidebar-logo" onClick={() => setMobileNavOpen(false)}>
          <span className="sidebar-logo-icon">
            <Crown size={22} />
          </span>
          <span className="sidebar-logo-text">{t("PlayChess")}</span>
        </Link>

        <nav className="landing-sidebar-nav" aria-label={t("Main")}>
          {NAV_LINKS.map(({ icon: Icon, label, to }) => (
            <button
              key={label}
              className="landing-sidebar-nav-link"
              onClick={() => goTo(to)}
              type="button"
            >
              <Icon size={22} className="landing-sidebar-nav-icon" />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>

        {/* "Other" collapsible group — mirrors chess.com's overflow rail */}
        <nav className="landing-sidebar-nav landing-sidebar-nav-other" aria-label={t("More")}>
          {OTHER_LINKS.map((l) => (
            <button
              key={l.label}
              className="landing-sidebar-nav-link landing-sidebar-nav-link-sub"
              onClick={() => goTo(l.to)}
              type="button"
            >
              <span className="landing-sidebar-nav-bullet" />
              <span>{t(l.label)}</span>
            </button>
          ))}
        </nav>

        <button className="sidebar-search" type="button" aria-label={t("Search")}>
          <Search size={16} />
          <span>{t("Search")}</span>
          <span className="sidebar-search-shortcut">/</span>
        </button>

        {/* Live-player count — chess.com shows a green online indicator */}
        <div className="sidebar-online" title={t("Players online now")}>
          <span className="sidebar-online-dot" />
          <span>{t('{count} online', { count: stats.livePlayers.toLocaleString(getActiveLocale()) })}</span>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-auth">
          {isLoggedIn ? (
            <button className="btn-green btn-block" onClick={() => goTo('/home')} type="button">
              {t("Go to Dashboard")}<ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button
                className="btn-green btn-block"
                onClick={() => goTo('/login?mode=signup')}
                type="button"
              >
                <UserPlus size={16} />
                {t("Sign Up")}</button>
              <button
                className="btn-ghost btn-block"
                onClick={() => goTo('/login')}
                type="button"
              >
                <LogIn size={16} />
                {t("Log In")}</button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile nav backdrop */}
      <button
        className="landing-nav-backdrop"
        aria-label={t("Close menu")}
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
      />

      {/* Mobile nav toggle */}
      <button
        className="landing-burger"
        type="button"
        onClick={() => setMobileNavOpen((v) => !v)}
        aria-label={t("Toggle navigation")}
        aria-expanded={mobileNavOpen}
      >
        {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <main className="landing-main">
        {/* === Hero — board on the left, "Play Chess Online on the #1 Site!" + Get Started on the right === */}
        <section className="hero">
          <div className="hero-board">
            <div className="hero-board-frame">
              <ChessBoard
                position={demoFen}
                onSquareClick={handleDemoSquareClick}
                onPieceDrop={handleDemoPieceDrop}
                customSquareStyles={demoSquareStyles}
                showCoordinates={false}
                boardTheme="green"
              />
            </div>
            <div className="hero-board-live">
              <span className="dot" /> {' '}{t("Live preview")}</div>
          </div>

          <div className="hero-copy">
            <h1 className="hero-title">
              {heroTitleBefore}<span className="hero-title-num">{HERO_RANK}</span>{heroTitleAfter}</h1>
            <p className="hero-subtitle">
              {t("Play the bots, find a rated opponent, and keep your games in one place. Free, no download.")}{' '}
              <span className="hero-online">
                {stats.livePlayers.toLocaleString(getActiveLocale())} {' '}{t("playing now")}</span>
            </p>

            <div className="hero-actions">
              {/* A guest gets a playable board from the first click; signing up
                  stays one click away on the secondary button and in the
                  sidebar, so nothing about the funnel is lost. */}
              <button
                className="btn-green btn-lg"
                onClick={() => goTo(isLoggedIn ? '/online' : '/play')}
                type="button"
              >
                {isLoggedIn ? null : <Cpu size={18} />}
                {t(isLoggedIn ? 'Get Started' : 'Play a Bot')}<ArrowRight size={18} />
              </button>
              <button
                className="btn-ghost btn-lg"
                onClick={() => goTo(isLoggedIn ? '/play' : '/login?mode=signup')}
                type="button"
              >
                {isLoggedIn ? <Cpu size={18} /> : <UserPlus size={18} />}
                {t(isLoggedIn ? 'Play a Bot' : 'Create an account')}</button>
            </div>
          </div>
        </section>

        {/* === Live stats bar === */}
        {stats.livePlayers > 0 || stats.gamesRecorded > 0 ? (
          <section className="stats-bar" aria-label={t("Live stats")}>
            <div className="stat-item">
              <Users size={16} />
              <strong>{stats.livePlayers.toLocaleString(getActiveLocale())}</strong>
              <span>{t("Playing Now")}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <Gamepad2 size={16} />
              <strong>{stats.gamesRecorded.toLocaleString(getActiveLocale())}</strong>
              <span>{t("Games Recorded")}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <UsersRound size={16} />
              <strong>{stats.registeredPlayers.toLocaleString(getActiveLocale())}</strong>
              <span>{t("Members")}</span>
            </div>
          </section>
        ) : null}

        <ul className="landing-feature-list" role="list">
          {FEATURES.map(({ icon: Icon, title, description, to, cta }) => (
            <li className="landing-feature-item" key={to}>
              <Icon size={20} aria-hidden="true" />
              <div>
                <h2>{t(title)}</h2>
                <p>{t(description)}</p>
                <Link to={to} className="landing-feature-link" onClick={() => setMobileNavOpen(false)}>
                  {t(cta)} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>

        {/* === Footer === */}
        <footer className="landing-footer">
          <div className="footer-links">
            {FOOTER_LINKS.map((l) =>
              l.to ? (
                <Link key={l.label} to={l.to} className="footer-link">
                  {t(l.label)}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="footer-link">
                  {t(l.label)}
                </a>
              ),
            )}
          </div>

          <p className="footer-copyright">
            {t("PlayChess · © 2026 · Inspired by")}{' '}
            <a href="https://www.chess.com" target="_blank" rel="noopener noreferrer">
              {t("Chess.com")}</a>
          </p>
        </footer>
      </main>
    </div>
  )
}
