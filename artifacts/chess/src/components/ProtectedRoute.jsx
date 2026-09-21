import { LockKeyhole } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import './ProtectedRoute.css'

export default function ProtectedRoute({ children, loginRequiredFor }) {
  const { isLoggedIn, isLoading } = useUser()
  const navigate = useNavigate()

  if (isLoading) {
    return <div className="loading-screen"><div className="spinner"></div></div>
  }

  if (!isLoggedIn && loginRequiredFor) {
    return (
      <section className="login-required-page" aria-labelledby="login-required-title">
        <div className="login-required-card card-surface">
          <span className="login-required-icon" aria-hidden="true">
            <LockKeyhole size={32} />
          </span>
          <h1 id="login-required-title">Log in required</h1>
          <p>You need to log in to access {loginRequiredFor}.</p>
          <div className="login-required-actions">
            <button type="button" className="login-required-primary" onClick={() => navigate('/login')}>
              Log In
            </button>
            <button type="button" className="login-required-secondary" onClick={() => navigate('/play')}>
              Back to Play
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />

  return children
}
