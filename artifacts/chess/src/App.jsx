import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './contexts/UserContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { FeedbackPanel } from './components/FeedbackPanel'
import ErrorBoundary from './components/ErrorBoundary'
import SetUsernameModal from "./components/SetUsernameModal"
import UserBadge from './components/UserBadge'
import GuestBlocked from './components/GuestBlocked'
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
const CloudFlare = lazy(() => import('./pages/CloudFlare'))
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

  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname

  return (
    <>
      {/* Top header (simplified) */}
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="app-logo">
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
    if (guestRedirect) {
      return guestRedirect;
    }
    return <Navigate to="/" replace />;
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

/**
 * Intercepts all navigations while the user is in the pending-verification state.
 * Rendered as a null component inside BrowserRouter so it always runs,
 * regardless of which route is active.
 */
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

/**
 * Persistent app shell — renders AppHeader once and keeps it visible
 * during route transitions. Suspense only covers the page content area
 * (via <Outlet>), so navigation never causes a full blank screen.
 */
function AppShell() {
  return (
    <div className="app">
      <AppHeader />
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
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
            <BrowserRouter><SetUsernameModal />
              <GlobalVerificationGuard />
              <Routes>
                {/* Headerless routes — full-screen layouts */}
                <Route path="/" element={<Suspense fallback={<RouteFallback />}><Landing /></Suspense>} />
                <Route path="/login" element={<Suspense fallback={<RouteFallback />}><Login /></Suspense>} />
                {/* Verify email — OTP entry after requestOtp; locked until verified or cancelled */}
                <Route path="/verify-email" element={<Suspense fallback={<RouteFallback />}><VerifyEmail /></Suspense>} />
                {/* Auth callback — Supabase OTP / magic link redirects here */}

                {/* App routes — share persistent AppHeader via AppShell layout */}
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
              {/* FeedbackPanel lives outside Routes so it persists across all navigations */}
              <FeedbackPanel />
            </BrowserRouter>
          </SettingsProvider>
        </UserProvider>
      </ErrorBoundary>
    </>
  )
}
