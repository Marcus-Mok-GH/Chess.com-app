import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './contexts/UserContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { FeedbackPanel } from './components/FeedbackPanel'
import ErrorBoundary from './components/ErrorBoundary'
import UserBadge from './components/UserBadge'
import GuestBlocked from './components/GuestBlocked'
import { usePuter } from './hooks/usePuter'
import { Analytics } from '@vercel/analytics/react'
import './App.css'

const Home = lazy(() => import('./pages/Home'))
const Play = lazy(() => import('./pages/Play'))
const OnlinePlay = lazy(() => import('./pages/OnlinePlay'))
const Analysis = lazy(() => import('./pages/Analysis'))
const Login = lazy(() => import('./pages/Login'))
const GameHistory = lazy(() => import('./pages/GameHistory'))
const Game = lazy(() => import('./pages/Game'))
const Settings = lazy(() => import('./pages/Settings'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Landing = lazy(() => import('./pages/Landing'))

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

  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname

  return (
    <>
      {/* Top header (simplified) */}
      <header className="app-header">
        <div className="header-content">
          <Link to={isLoggedIn ? "/home" : "/"} className="app-logo">
            ♟️ Chess
          </Link>
          <h1 className="page-title">{getTitle(location.pathname)}</h1>
          {!isOnline && (
            <span className="offline-indicator" title="You are currently offline. Online play is disabled.">
              ⚠️ Offline
            </span>
          )}
          {isLoggedIn && (
            <div className="header-right">
              <div className="user-menu">
                <span className="user-info">
                  {user.username} ({user.elo})
                </span>
                <button onClick={logout} className="logout-btn">
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Bottom navigation bar */}
      <nav className="bottom-nav">
        <div className="nav-content">
          <Link
            to="/home"
            className={`nav-tab ${currentPath === '/home' ? 'active' : ''}`}
          >
            <div className="nav-icon">🏠</div>
            <span className="nav-label">Home</span>
          </Link>
          <Link
            to="/play"
            className={`nav-tab ${currentPath === '/play' ? 'active' : ''}`}
          >
            <div className="nav-icon">♟️</div>
            <span className="nav-label">Play</span>
          </Link>
          {isOnline ? (
            <Link
              to="/online"
              className={`nav-tab ${currentPath === '/online' ? 'active' : ''}`}
            >
              <div className="nav-icon">🌐</div>
              <span className="nav-label">Online</span>
            </Link>
          ) : (
            <span className="nav-tab disabled" title="Online play unavailable while offline">
              <div className="nav-icon">🌐</div>
              <span className="nav-label">Offline</span>
            </span>
          )}
          <Link
            to="/history"
            className={`nav-tab ${currentPath === '/history' ? 'active' : ''}`}
          >
            <div className="nav-icon">📚</div>
            <span className="nav-label">History</span>
          </Link>
          <Link
            to="/settings"
            className={`nav-tab ${currentPath === '/settings' ? 'active' : ''}`}
          >
            <div className="nav-icon">⚙️</div>
            <span className="nav-label">Settings</span>
          </Link>
        </div>
      </nav>
    </>
  )
}

// Puter.js initialization check
function PuterCheck() {
  const { isReady, injectPuterScript } = usePuter();

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    if (isReady && import.meta.env.DEV) {
      console.log('✅ Puter.js loaded successfully');
    }
  }, [isReady]);

  // Inject script only if it's actually used by some component or on user interaction
  // For now, we'll keep the logic but won't auto-inject here to save initial load.

  return null;
}

function ProtectedRoute({ children, guestRedirect }) {
  const { isLoggedIn, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    // For Online route, show a friendly guest message instead of redirecting to login
    if (guestRedirect) {
      return guestRedirect;
    }
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RouteFallback() {
  return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading...</p>
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
              <Suspense fallback={<RouteFallback />}>
                <div className="app">
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/home" element={
                      <ProtectedRoute>
                        <><AppHeader /><Home /></>
                      </ProtectedRoute>
                    } />
                    <Route path="/play" element={<><AppHeader /><Play /></>} />
                    <Route path="/online" element={<><AppHeader /><OnlinePlay /></>} />
                    <Route path="/online/:gameId" element={<><AppHeader /><OnlinePlay /></>} />
                    <Route path="/game/:gameId" element={<><AppHeader /><Game /></>} />
                    <Route path="/analysis/:gameId?" element={
                      <ProtectedRoute>
                        <><AppHeader /><Analysis /></>
                      </ProtectedRoute>
                    } />
                    <Route path="/history" element={
                      <ProtectedRoute>
                        <><AppHeader /><GameHistory /></>
                      </ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                      <ProtectedRoute>
                        <><AppHeader /><Settings /></>
                      </ProtectedRoute>
                    } />
                    <Route path="/changelog" element={<><AppHeader /><Changelog /></>} />
                  </Routes>
                </div>
                <FeedbackPanel />
              </Suspense>
            </BrowserRouter>
          </SettingsProvider>
        </UserProvider>
      </ErrorBoundary>
      <Analytics />
    </>
  )
}
