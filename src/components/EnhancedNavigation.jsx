import { useNavigate, useLocation } from 'react-router-dom'
import { LogoIcon } from './ChessPieceIcon'
import Breadcrumb from './Breadcrumb'
import UserBadge from './UserBadge'
import useKeyboardNavigation from '../hooks/useKeyboardNavigation'
import './EnhancedNavigation.css'

const navigationMap = {
  '/': { title: 'Home', parent: null },
  '/play': { title: 'vs Computer', parent: '/' },
  '/online': { title: 'Online Play', parent: '/' },
}

export default function EnhancedNavigation({ title, showBack = true, showBreadcrumb = true }) {
  const navigate = useNavigate()
  const location = useLocation()
  useKeyboardNavigation()

  const currentPath = location.pathname.startsWith('/online/') ? '/online' : location.pathname
  const navInfo = navigationMap[currentPath]
  const displayTitle = title || navInfo?.title || 'Chess'

  const handleBack = () => {
    if (navInfo?.parent) {
      navigate(navInfo.parent)
    } else {
      navigate(-1)
    }
  }

  return (
    <>
      {/* Top header (simplified) */}
      <div className="top-header">
        <div className="header-content">
          <div className="logo" onClick={() => navigate('/')} title="Home (Alt+H)">
            <LogoIcon size={24} /> Chess
          </div>
          <h1 className="page-title">{displayTitle}</h1>
          {showBack && currentPath !== '/' && (
            <button className="back-btn" onClick={handleBack} title="Go back (Alt+B)">
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav className="bottom-nav">
        <div className="nav-content">
          <button
            className={`nav-tab ${currentPath === '/' ? 'active' : ''}`}
            onClick={() => navigate('/')}
            title="Home (Alt+H)"
          >
            <div className="nav-icon">
              <LogoIcon size={20} />
            </div>
            <span className="nav-label">Home</span>
          </button>
          <button
            className={`nav-tab ${currentPath === '/play' ? 'active' : ''}`}
            onClick={() => navigate('/play')}
            title="Play vs Computer (Alt+P)"
          >
            <div className="nav-icon">
              <LogoIcon size={20} />
            </div>
            <span className="nav-label">Play</span>
          </button>
          <button
            className={`nav-tab ${currentPath === '/online' ? 'active' : ''}`}
            onClick={() => navigate('/online')}
            title="Play Online (Alt+O)"
          >
            <div className="nav-icon">
              <LogoIcon size={20} />
            </div>
            <span className="nav-label">Online</span>
          </button>
          <UserBadge />
        </div>
      </nav>
      {showBreadcrumb && <Breadcrumb />}
    </>
  )
}
