import { useState, useEffect } from 'react'
import './NavigationHints.css'

export default function NavigationHints() {
  const [isVisible, setIsVisible] = useState(false)



  useEffect(() => {
    const handleKeyPress = (event) => {
      // Show hints with Ctrl+? or Cmd+?
      if ((event.ctrlKey || event.metaKey) && event.key === '?') {
        event.preventDefault()
        setIsVisible(true)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  if (!isVisible) return null

  return (
    <div className="nav-hints-overlay" onClick={() => setIsVisible(false)}>
      <div className="nav-hints-modal" onClick={e => e.stopPropagation()}>
        <div className="nav-hints-header">
          <h3>Navigation Shortcuts</h3>
          <button className="close-btn" onClick={() => setIsVisible(false)}>×</button>
        </div>
        <div className="nav-hints-content">
          <div className="hint-group">
            <h4>Quick Navigation</h4>
            <div className="hint-item">
              <kbd>Ctrl</kbd> + <kbd>K</kbd> <span>Open quick navigation</span>
            </div>
            <div className="hint-item">
              <kbd>Alt</kbd> + <kbd>H</kbd> <span>Go to Home</span>
            </div>
            <div className="hint-item">
              <kbd>Alt</kbd> + <kbd>P</kbd> <span>Play vs Computer</span>
            </div>
            <div className="hint-item">
              <kbd>Alt</kbd> + <kbd>O</kbd> <span>Play Online</span>
            </div>
            <div className="hint-item">
              <kbd>Alt</kbd> + <kbd>B</kbd> <span>Go Back</span>
            </div>
          </div>
          <div className="hint-group">
            <h4>Help</h4>
            <div className="hint-item">
              <kbd>Ctrl</kbd> + <kbd>?</kbd> <span>Show this help</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
