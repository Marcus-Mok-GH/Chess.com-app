import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogoIcon } from '../components/ChessPieceIcon'
import { useUser } from '../contexts/UserContext'
import LoginModal from '../components/LoginModal'
import './Landing.css'

const FloatingPiece = ({ type, color, style }) => {
  const pieces = {
    wK: '/custom-pieces/wK.svg',
    wQ: '/custom-pieces/wQ.svg',
    wR: '/custom-pieces/wR.svg',
    wB: '/custom-pieces/wB.svg',
    wN: '/custom-pieces/wN.svg',
    wP: '/custom-pieces/wP.svg',
    bK: '/custom-pieces/bK.svg',
    bQ: '/custom-pieces/bQ.svg',
    bR: '/custom-pieces/bR.svg',
    bB: '/custom-pieces/bB.svg',
    bN: '/custom-pieces/bN.svg',
    bP: '/custom-pieces/bP.svg',
  }
  return (
    <img 
      src={pieces[`${color}${type}`]} 
      alt="" 
      className="floating-piece"
      style={style}
    />
  )
}

const floatingPiecesData = [
  { type: 'K', color: 'w' },
  { type: 'Q', color: 'w' },
  { type: 'R', color: 'w' },
  { type: 'B', color: 'w' },
  { type: 'N', color: 'w' },
  { type: 'P', color: 'w' },
  { type: 'K', color: 'b' },
  { type: 'Q', color: 'b' },
  { type: 'R', color: 'b' },
  { type: 'B', color: 'b' },
  { type: 'N', color: 'b' },
  { type: 'P', color: 'b' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { isLoggedIn, isLoading, isOnline } = useUser()
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Redirect logged in users to home page (but wait for loading to complete)
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true })
    }
  }, [isLoggedIn, isLoading, navigate])

  const handlePlayOnline = () => {
    if (!isOnline) {
      return // Do nothing when offline
    }
    if (!isLoggedIn) {
      setShowLoginModal(true)
    } else {
      navigate('/online')
    }
  }

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="floating-pieces">
          {floatingPiecesData.map((piece, i) => (
            <FloatingPiece 
              key={i}
              type={piece.type}
              color={piece.color}
              style={{
                left: `${(i * 8) + 2}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${6 + (i % 3) * 2}s`
              }}
            />
          ))}
        </div>

        <div className="hero-content">
          <h1 className="hero-title">Play Chess Online</h1>
          <p className="hero-subtitle">Challenge AI opponents of every skill level or battle players worldwide</p>
          
          <div className="hero-buttons">
            <button 
              className="play-button primary"
              onClick={() => navigate('/play')}
            >
              <img src="/custom-pieces/bN.svg" alt="" className="btn-icon" />
              Play vs Computer
            </button>
            <button 
              className={`play-button secondary ${!isOnline ? 'disabled' : ''}`}
              onClick={handlePlayOnline}
              disabled={!isOnline}
              title={!isOnline ? 'Online play unavailable while offline' : ''}
            >
              <span className="btn-icon-emoji">🌐</span>
              {!isOnline ? 'Online (Offline)' : 'Play Online'}
            </button>
          </div>
        </div>

        <div className="hero-image">
          <div className="chess-preview">
            <div className="preview-board">
              {[...Array(8)].map((_, row) => (
                <div key={row} className="preview-row">
                  {[...Array(8)].map((_, col) => (
                    <div 
                      key={col} 
                      className={`preview-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-content">
          <div className="stat-item">
            <span className="stat-number">10,000+</span>
            <span className="stat-label">Active Players</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">100+</span>
            <span className="stat-label">ELO Levels</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">&lt;3s</span>
            <span className="stat-label">Instant Matchmaking</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">24/7</span>
            <span className="stat-label">Always Available</span>
          </div>
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title">Why Players Love Us</h2>
        <div className="features-content">
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>Play Against Bots</h3>
            <p>Choose from multiple AI opponents with different personalities and skill levels</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Track Your Moves</h3>
            <p>Review complete game history with detailed move notation</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Powered by Stockfish</h3>
            <p>World-class chess engine providing challenging gameplay</p>
          </div>
        </div>
      </div>

      <div className="how-it-works-section">
        <h2 className="section-title">How It Works</h2>
        <div className="steps-content">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-icon">🎯</div>
            <h3>Choose Your Mode</h3>
            <p>Play against AI bots or challenge real players online</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-icon-img">
              <img src="/custom-pieces/bP.svg" alt="" />
            </div>
            <h3>Play Your Game</h3>
            <p>Enjoy smooth gameplay with intuitive controls</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-icon">📈</div>
            <h3>Improve & Grow</h3>
            <p>Learn from each game and climb the ranks</p>
          </div>
        </div>
      </div>

      <div className="why-choose-section">
        <h2 className="section-title">Why Choose Us</h2>
        <div className="benefits-grid">
          <div className="benefit-item">
            <span className="benefit-icon">💰</span>
            <div className="benefit-text">
              <h4>100% Free</h4>
              <p>No hidden fees or premium locks</p>
            </div>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon">🚀</span>
            <div className="benefit-text">
              <h4>No Account Needed</h4>
              <p>Jump straight into playing</p>
            </div>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon">🎮</span>
            <div className="benefit-text">
              <h4>Multiple Game Modes</h4>
              <p>AI, online, and more coming</p>
            </div>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon">⚡</span>
            <div className="benefit-text">
              <h4>Instant Play</h4>
              <p>Start a game in seconds</p>
            </div>
          </div>
        </div>
      </div>

      <div className="testimonials-section">
        <h2 className="section-title">Words of Wisdom</h2>
        <div className="testimonials-content">
          <div className="testimonial-card">
            <p className="quote">"Chess is the gymnasium of the mind."</p>
            <span className="author">— Blaise Pascal</span>
          </div>
          <div className="testimonial-card">
            <p className="quote">"Every chess master was once a beginner."</p>
            <span className="author">— Irving Chernev</span>
          </div>
          <div className="testimonial-card">
            <p className="quote">"Chess is life in miniature."</p>
            <span className="author">— Garry Kasparov</span>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="logo">
              <LogoIcon size={24} /> Chess
            </span>
            <p>Play, Learn, Master</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Play</h4>
              <Link to="/play">vs Computer</Link>
              <Link to="/online">Online</Link>
            </div>
            <div className="footer-column">
              <h4>Learn</h4>
              <a href="#">Tutorials</a>
              <a href="#">Openings</a>
            </div>
            <div className="footer-column">
              <h4>Community</h4>
              <a href="#">Discord</a>
              <a href="#">Forums</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 Chess. Made with ♥ for chess lovers everywhere.</p>
        </div>
      </footer>

      {showLoginModal && (
        <LoginModal 
          mode="friendly"
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => {
            setShowLoginModal(false)
            navigate('/online')
          }}
          onContinueAsGuest={() => {
            setShowLoginModal(false)
            navigate('/online')
          }}
        />
      )}
    </div>
  )
}
