import { useEffect, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './contexts/UserContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { FeedbackPanel } from './components/FeedbackPanel'
import ErrorBoundary from './components/ErrorBoundary'
import SetUsernameModal from './components/SetUsernameModal'
import PollinationsCoachPrompt from './components/PollinationsCoachPrompt'
import api from './services/api'
import { usePuter } from './hooks/usePuter'
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
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Puzzles = lazy(() => import('./pages/Puzzles'))
const NotFound = lazy(() => import('./pages/not-found'))

function getTitle(path) {
  if (path.startsWith('/online/') || path.startsWith('/game/')) return 'Online Play'
  if (path.startsWith('/analysis')) return 'Game Review'
  if (path === '/home') return 'Home'
  if (path === '/play') return 'Play'
  if (path === '/online') return 'Online Play'
  if (path === '/history') return 'Game History'
  if (path === '/settings') return 'Settings'
  if (path === '/changelog') return 'Changelog'
  if (path === '/puzzles') return 'Puzzles'
  return 'PlayChess'
}

function AppHeader({ isGameRoute = false }) {
  const location = useLocation()
  const { isOnline, isLoggedIn, user, logout } = useUser()
  const navigate = useNavigate()

  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname
  const isLanding = location.pathname === '/'

  if (isLanding) return null
  if (isGameRoute) return null

  return (
    <>
      {/* Sidebar for Desktop */}
      <aside className="sidebar-nav">
        <div className="sidebar-content">
          <Link to="/home" className="sidebar-logo">
            <span className="logo-text">PlayChess</span>
          </Link>

          <div className="sidebar-links">
            <Link to="/play" className={`sidebar-item ${currentPath === '/play' ? 'active' : ''}`}>
              <span className="sidebar-icon">♟️</span>
              <span className="sidebar-label">Play</span>
            </Link>
            <Link to="/online" className={`sidebar-item ${currentPath === '/online' ? 'active' : ''}`}>
              <span className="sidebar-icon">🌐</span>
              <span className="sidebar-label">Online Play</span>
            </Link>
            <Link to="/puzzles" className={`sidebar-item ${currentPath === '/puzzles' ? 'active' : ''}`}>
              <span className="sidebar-icon">🧩</span>
              <span className="sidebar-label">Puzzles</span>
            </Link>
            <Link to="/history" className={`sidebar-item ${currentPath === '/history' ? 'active' : ''}`}>
              <span className="sidebar-icon">📚</span>
              <span className="sidebar-label">Archive</span>
            </Link>
            <Link to="/analysis" className={`sidebar-item ${currentPath === '/analysis' ? 'active' : ''}`}>
              <span className="sidebar-icon">🔬</span>
              <span className="sidebar-label">Analysis</span>
            </Link>
          </div>

          <div className="sidebar-footer">
            {isLoggedIn ? (
              <div className="user-profile-mini">
                <div className="user-info">
                   <span className="username">{user.username}</span>
                   <span className="elo">{user.elo}</span>
                </div>
                <button onClick={logout} className="sidebar-logout" title="Logout">🚪</button>
              </div>
            ) : (
              <button onClick={() => navigate('/login')} className="sidebar-login">Log In</button>
            )}
            <Link to="/settings" className={`sidebar-item ${currentPath === '/settings' ? 'active' : ''}`} title="Settings">
              <span className="sidebar-icon">⚙️</span>
            </Link>
            <Link to="/terms" className="sidebar-item">Terms</Link>
            <Link to="/privacy" className="sidebar-item">Privacy</Link>
          </div>
        </div>
      </aside>

      {/* Top Mobile Header */}
      <header className="mobile-header">
        <Link to="/" className="app-logo">♟️ PlayChess</Link>
        <h1 className="page-title">{getTitle(location.pathname)}</h1>
      </header>

      {/* Bottom Mobile Navigation */}
      <nav className="bottom-nav">
        <Link to="/home" className={`nav-item ${currentPath === '/home' ? 'active' : ''}`}>
          <div className="nav-icon">🏠</div>
          <span>Home</span>
        </Link>
        <Link to="/play" className={`nav-item ${currentPath === '/play' ? 'active' : ''}`}>
          <div className="nav-icon">♟️</div>
          <span>Play</span>
        </Link>
        <Link to="/online" className={`nav-item ${currentPath === '/online' ? 'active' : ''}`}>
          <div className="nav-icon">🌐</div>
          <span>Online</span>
        </Link>
        <Link to="/puzzles" className={`nav-item ${currentPath === '/puzzles' ? 'active' : ''}`}>
          <div className="nav-icon">🧩</div>
          <span>Puzzles</span>
        </Link>
        <Link to="/history" className={`nav-item ${currentPath === '/history' ? 'active' : ''}`}>
          <div className="nav-icon">📚</div>
          <span>History</span>
        </Link>
        <Link to="/settings" className={`nav-item ${currentPath === '/settings' ? 'active' : ''}`}>
          <div className="nav-icon">⚙️</div>
          <span>Settings</span>
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

function PollinationsCoachGate() {
  const { user, token, isLoggedIn, isLoading } = useUser();
  const [showPrompt, setShowPrompt] = useState(false);
  const [mode, setMode] = useState('connect');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isLoading || checked) return;
    let cancelled = false;
    async function checkPrompt() {
      try {
        if (isLoggedIn && user?.username && token) {
          const settings = await api.getUserSettings(user.username, token);
          const seen = Boolean(settings?.settings?.pollinationsCoachPromptSeen);
          if (!cancelled && !seen) {
            setMode('connect');
            setShowPrompt(true);
          }
        } else {
          const seen = localStorage.getItem('pollinationsCoachPromptSeen');
          if (!cancelled && !seen) {
            setMode('login');
            setShowPrompt(true);
          }
        }
      } catch (error) {
        console.error('[PollinationsCoachGate] Failed to load prompt state:', error);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }
    checkPrompt();
    return () => { cancelled = true; };
  }, [checked, isLoading, isLoggedIn, token, user?.username]);

  async function markPromptSeen() {
    try {
      if (isLoggedIn && user?.username && token) {
        const current = await api.getUserSettings(user.username, token);
        await api.updateUserSettings(user.username, {
          ...(current?.settings || {}),
          pollinationsCoachPromptSeen: true,
        }, token);
      } else {
        localStorage.setItem('pollinationsCoachPromptSeen', 'true');
      }
    } catch (error) {
      console.error('[PollinationsCoachGate] Failed to persist prompt state:', error);
      return;
    }
    setShowPrompt(false);
  }

  useEffect(() => {
    if (!user?.username || !token || !window.location.search.includes('coach_connected=1')) return;
    markPromptSeen().finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('coach_connected');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    });
  }, [token, user?.username]);

  if (!showPrompt) return null;

  return (
    <PollinationsCoachPrompt mode={mode} onConnected={markPromptSeen} />
  );
}

function AppShell() {
  const location = useLocation();
  const isGameRoute = location.pathname === '/play' ||
                     location.pathname.startsWith('/game/') || 
                     (location.pathname.startsWith('/online/') && location.pathname.length > 8);
  
  return (
    <div className={`app ${isGameRoute ? 'hide-bottom-nav' : ''}`}>
      <AppHeader isGameRoute={isGameRoute} />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100svh" }}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
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
              <PollinationsCoachGate />
              <GlobalVerificationGuard />
              <Routes>
                <Route path="/" element={<Suspense fallback={<RouteFallback />}><Landing /></Suspense>} />
                <Route path="/login" element={<Suspense fallback={<RouteFallback />}><Login /></Suspense>} />
                <Route path="/signup" element={<Navigate to="/login?mode=signup" replace />} />
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
                  <Route path="/puzzles" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><Puzzles /></Suspense></ProtectedRoute>} />
                </Route>
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<Suspense fallback={<RouteFallback />}><NotFound /></Suspense>} />
              </Routes>
              <FeedbackPanel />
            </BrowserRouter>
          </SettingsProvider>
        </UserProvider>
      </ErrorBoundary>
    </>
  )
}
