import { LockKeyhole } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './AccountRequired.css'

// Inline notice rendered inside a page in place of account-specific content
// (stats, history, club membership, etc.). The page itself still renders for
// guests; only the parts that need an account show this notice.
export default function AccountRequired({ title = 'Account required', message }) {
  const navigate = useNavigate()

  return (
    <section className="account-required" aria-labelledby="account-required-title">
      <div className="account-required-card card-surface">
        <span className="account-required-icon" aria-hidden="true">
          <LockKeyhole size={26} />
        </span>
        <h2 id="account-required-title">{title}</h2>
        <p>{message || 'You need an account to access this info. Log in or create one to continue.'}</p>
        <div className="account-required-actions">
          <button type="button" className="account-required-primary" onClick={() => navigate('/login')}>
            Log In
          </button>
          <button type="button" className="account-required-secondary" onClick={() => navigate('/login?mode=signup')}>
            Sign Up
          </button>
        </div>
      </div>
    </section>
  )
}
