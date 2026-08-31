import { useNavigate, useLocation } from 'react-router-dom'
import { LogoIcon } from './ChessPieceIcon'
import './Navigation.css'

export default function Navigation({ title }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isPlayActive = location.pathname === '/play'
  const isOnlineActive = location.pathname.startsWith('/online')

  return (
    <nav className="main-nav" aria-label="Main navigation">
      <div className="nav-content">
        <button
          type="button"
          className="logo-btn"
          onClick={() => navigate('/')}
          aria-label="Chess homepage"
        >
          <LogoIcon size={24} /> Chess
        </button>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="nav-links">
          <button
            type="button"
            className={`nav-link ${isPlayActive ? 'active' : ''}`}
            aria-current={isPlayActive ? 'page' : undefined}
            onClick={() => navigate('/play')}
          >
            vs Computer
          </button>
          <button
            type="button"
            className={`nav-link ${isOnlineActive ? 'active' : ''}`}
            aria-current={isOnlineActive ? 'page' : undefined}
            onClick={() => navigate('/online')}
          >
            Online
          </button>
        </div>
      </div>
    </nav>
  )
}