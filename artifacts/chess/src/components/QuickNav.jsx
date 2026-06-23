import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './QuickNav.css'

export default function QuickNav() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyPress = (event) => {
      // Toggle quick nav with Ctrl+K or Cmd+K
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        setIsOpen(prev => !prev)
      }
      
      // Close on Escape
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  const handleNavigation = (path) => {
    navigate(path)
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="quick-nav-overlay" onClick={() => setIsOpen(false)}>
      <div className="quick-nav-modal" onClick={e => e.stopPropagation()}>
        <div className="quick-nav-header">
          <h3>Quick Navigation</h3>
          <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
        </div>
        <div className="quick-nav-items">
          <button className="quick-nav-item" onClick={() => handleNavigation('/')}>
            <span className="nav-icon">🏠</span>
            <div>
              <div className="nav-title">Home</div>
              <div className="nav-shortcut">Alt + H</div>
            </div>
          </button>
          <button className="quick-nav-item" onClick={() => handleNavigation('/play')}>
            <span className="nav-icon">🤖</span>
            <div>
              <div className="nav-title">Play vs Computer</div>
              <div className="nav-shortcut">Alt + P</div>
            </div>
          </button>
          <button className="quick-nav-item" onClick={() => handleNavigation('/online')}>
            <span className="nav-icon">🌐</span>
            <div>
              <div className="nav-title">Play Online</div>
              <div className="nav-shortcut">Alt + O</div>
            </div>
          </button>
        </div>
        <div className="quick-nav-footer">
          <small>Press Ctrl+K to toggle • Esc to close</small>
        </div>
      </div>
    </div>
  )
}
