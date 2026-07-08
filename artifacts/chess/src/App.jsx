import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './contexts/UserContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { FeedbackPanel } from './components/FeedbackPanel'
import ErrorBoundary from './components/ErrorBoundary'
import SetUsernameModal from "./components/SetUsernameModal"
import { usePuter } from './hooks/usePuter'
import { LogoMark, HomeIcon, PlayIcon, OnlineIcon, ArchiveIcon, AnalysisIcon, SettingsIcon } from './components/Icons'
import './App.css'

const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Play = lazy(() => import('./pages/Play'))
const OnlinePlay = lazy(() => import('./pages/OnlinePlay'))
const Analysis = lazy(() => import('./pages/Analysis'))
const GameHistory = lazy(() => import('./pages/GameHistory'))
const Game = lazy(() => import('./pages/Game'))
const Settings = lazy(() => import('./pages/Settings'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Landing = lazy(() => import('./pages/Landing'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))

function getTitle(path) {
  if (path.startsWith('/online/') || path.startsWith('/game/')) return 'Online Play'
  if (path === '/analysis') return 'Game Analysis'
  if (path === '/history') return 'Game History'
  if (path === '/settings') return 'Settings'
  if (path === '/changelog') return 'Changelog'
  return 'Chess'
}

function AppHeader() {
  const location = useLocation()
  const { isOnline, isLoggedIn, user, logout } = useUser()
  const navigate = useNavigate()

  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname
  const isLanding = location.pathname === '/'

  if (isLanding) return null

  const initial = (user?.username || '?').charAt(0).toUpperCase()

  return (
    <>
      {/* ── Desktop Top Header ── */}
      <header className="top-header">
        <div className="top-header-left">
          <Link to="/home" className="top-header-logo">
            <LogoMark size={22} />
            <span>chess.com-app</span>
          </Link>
          <nav className="top-header-nav">
            <Link to="/play" className={`top-header-link ${currentPath === '/play' ? 'active' : ''}`}>
              <PlayIcon /> Play
            </Link>
            <Link to="/online" className={`top-header-link ${currentPath === '/online' ? 'active' : ''}`}>
              <OnlineIcon /> Online
            </Link>
            <Link to="/analysis" className={`top-header-link ${currentPath === '/analysis' ? 'active' : ''}`}>
              <AnalysisIcon /> Analysis
            </Link>
            <Link to="/history" className={`top-header-link ${currentPath === '/history' ? 'active' : ''}`}>
              <ArchiveIcon /> Archive
            </Link>
          </nav>
        </div>
        <div className="top-header-right">
          {!isOnline && <span className="offline-badge">Offline</span>}
          {isLoggedIn ? (
            <div className="user-pill" onClick={() => navigate('/settings')} role="button" tabIndex={0}>
              <div className="user-avatar">{initial}</div>
              <span className="user-pill-name">{user.username}</span>
              <span className="user-pill-elo">{user.elo}</span>
            </div>
          ) : (
            <button className="top-header-cta" onClick={() => navigate('/login')}>Sign In</button>
          )}
        </div>
      </header>

      {/* ── Desktop Sidebar (icon rail) ── */}
      <aside className="sidebar-nav">
        <div className="sidebar-list">
          <Link to="/home" className={`sidebar-item ${currentPath === '/home' ? 'active' : ''}`} aria-label="Home">
            <HomeIcon /> <span>Home</span>
          </Link>
          <Link to="/play" className={`sidebar-item ${currentPath === '/play' ? 'active' : ''}`} aria-label="Play">
            <PlayIcon /> <span>Play</span>
          </Link>
          <Link to="/online" className={`sidebar-item ${currentPath === '/online' ? 'active' : ''}`} aria-label="Online">
            <OnlineIcon /> <span>Online</span>
          </Link>
          <Link to="/analysis" className={`sidebar-item ${currentPath === '/analysis' ? 'active' : ''}`} aria-label="Analysis">
            <AnalysisIcon /> <span>Analysis</span>
          </Link>
          <Link to="/history" className={`sidebar-item ${currentPath === '/history' ? 'active' : ''}`} aria-label="Archive">
            <ArchiveIcon /> <span>Archive</span>
          </Link>
        </div>
        <div className="sidebar-footer">
          <Link to="/settings" className={`sidebar-item ${currentPath === '/settings' ? 'active' : ''}`} aria-label="Settings">
            <SettingsIcon /> <span>Settings</span>
          </Link>
        </div>
      </aside>

      {/* ── Mobile Top Header ── */}
      <header className="mobile-header">
        <Link to="/home" className="app-logo">
          <LogoMark size={20} />
          <span>chess</span>
        </Link>
        <h1 className="page-title">{getTitle(location.pathname)}</h1>
        {!isOnline && <span className="offline-badge">Offline</span>}
      </header>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="bottom-nav" aria-label="Primary">
        <Link to="/home" className={`nav-item ${currentPath === '/home' ? 'active' : ''}`}>
          <HomeIcon /> <span>Home</span>
        </Link>
        <Link to="/play" className={`nav-item ${currentPath === '/play' ? 'active' : ''}`}>
          <PlayIcon /> <span>Play</span>
        </Link>
        <Link to="/online" className={`nav-item ${currentPath === '/online' ? 'active' : ''}`}>
          <OnlineIcon /> <span>Online</span>
        </Link>
        <Link to="/history" className={`nav-item ${currentPath === '/history' ? 'active' : ''}`}>
          <ArchiveIcon /> <span>History</span>
        </Link>
        <Link to="/settings" className={`nav-item ${currentPath === '/settings' ? 'active' : ''}`}>
          <SettingsIcon /> <span>Settings</span>
        </Link>
      </nav>
    </>
  )
}

function PuterCheck() {
  const { isReady } = usePuter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isReady && import.meta.env.DEV) {
      console.log('✅ Puter.js loaded successfully');
    }
  }, [isReady]);
  return null;
}

function ProtectedRoute({ children }) {
  const { isLoggedIn, isLoading } = useUser();
  if (isLoading) return <div className="loading-screen"><div className="spinner"></div></div>;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

function RouteFallback() {
  return <div className="loading-screen"><div className="spinner"></div></div>
}

function GlobalVerificationGuard() {
  const { isAwaitingVerification } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (isAwaitingVerification && location.pathname !== '/verify-email' && !location.pathname.startsWith('/auth/')) {
      navigate('/verify-email', { replace: true });
    }
  }, [isAwaitingVerification, location.pathname, navigate]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const isGameRoute = location.pathname.startsWith('/game/') ||
                     (location.pathname.startsWith('/online/') && location.pathname.length > 8);

  return (
    <div className={`app ${isGameRoute ? 'hide-bottom-nav' : ''}`}>
      <AppHeader />
      <div className="main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100svh', width: '100%' }}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <PuterCheck />
      <ErrorBoundary>
        <UserProvider>
          <SettingsProvider>
            <BrowserRouter>
              <SetUsernameModal />
              <GlobalVerificationGuard />
              <Routes>
                <Route path="/" element={<Suspense fallback={<RouteFallback />}><Landing /></Suspense>} />
                <Route path="/login" element={<Suspense fallback={<RouteFallback />}><Login /></Suspense>} />
                <Route path="/verify-email" element={<Suspense fallback={<RouteFallback />}><VerifyEmail /></Suspense>} />
                <Route element={<AppShell />}>
                  <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                  <Route path="/play" element={<Play />} />
                  <Route path="/online" element={<OnlinePlay />} />
                  <Route path="/online/:gameId" element={<OnlinePlay />} />
                  <Route path="/game/:gameId" element={<Game />} />
                  <Route path="/analysis/:gameId?" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
                  <Route path="/history" element={<ProtectedRoute><GameHistory /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  <Route path="/changelog" element={<Changelog />} />
                </Route>
              </Routes>
              <FeedbackPanel />
            </BrowserRouter>
          </SettingsProvider>
        </UserProvider>
      </ErrorBoundary>
    </>
  )
}
