import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './contexts/UserContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { FeedbackPanel } from './components/FeedbackPanel'
import ErrorBoundary from './components/ErrorBoundary'
import SetUsernameModal from "./components/SetUsernameModal"
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

  return (
    <>
      {/* Sidebar for Desktop */}
      <aside className="sidebar-nav">
        <div className="sidebar-content">
          <Link to="/home" className="sidebar-logo">
            <span className="logo-text">chess.com-app</span>
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
          </div>
        </div>
      </aside>

      {/* Top Mobile Header */}
      <header className="mobile-header">
        <Link to="/" className="app-logo">♟️ Chess</Link>
        <h1 className="page-title">{getTitle(location.pathname)}</h1>
        {!isOnline && <span className="offline-badge">Offline</span>}
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
  if (!isLoggedIn) return <Navigate to="/" replace />;
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
      <main style={{ flex: 1, minWidth: 0 }}>
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