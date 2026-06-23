import { useNavigate } from 'react-router-dom'
import { LogoIcon } from './ChessPieceIcon'
import './Navigation.css'

export default function Navigation({ title }) {
  const navigate = useNavigate()

  return (
    <nav className="main-nav">
      <div className="nav-content">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <LogoIcon size={24} /> Chess
        </div>
        {title && <h1 className="page-title">{title}</h1>}
        <div className="nav-links">
          <button className="nav-link" onClick={() => navigate('/play')}>
            vs Computer
          </button>
          <button className="nav-link" onClick={() => navigate('/online')}>
            Online
          </button>
        </div>
      </div>
    </nav>
  )
}