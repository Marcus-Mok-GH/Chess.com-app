import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './LoginModal.css';

export default function LoginModal({ onClose, onContinueAsGuest, mode = 'ranked' }) {
  const { requestMagicLink } = useUser();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isRequestingLink, setIsRequestingLink] = useState(false);
  const [linkStatus, setLinkStatus] = useState('');

  const handleRequestMagicLink = async () => {
    setError('');
    setLinkStatus('');
    if (!email.trim()) return setError('Please enter your email first.');
    if (!username.trim()) return setError('Please enter a username first.');

    setIsRequestingLink(true);
    try {
      const result = await requestMagicLink({ email, username });
      if (!result.success) return setError(result.error);
      setLinkStatus(result.message || 'Magic link sent successfully.');
    } finally {
      setIsRequestingLink(false);
    }
  };

  const isRanked = mode === 'ranked';

  return (
    <div className="login-overlay" onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
      <div className="login-modal">
        <div className="login-header">
          <h2>🎮 Ready to Play?</h2>
          <p>Sign in to track your progress, earn ELO, and climb the leaderboard with a magic link</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="login-form">
          <div className="input-group">
            <label htmlFor="username">Choose a username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoFocus autoComplete="off" maxLength={20} />
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
            <small>We&apos;ll email a magic link. Click it to auto-sign in and return to the app.</small>
            {error && <span className="error-text">{error}</span>}
            {!error && linkStatus && <span className="success-text">✅ {linkStatus}</span>}
          </div>

          <button type="button" className="btn btn-secondary btn-full" disabled={isRequestingLink || !username.trim() || !email.trim()} onClick={handleRequestMagicLink}>
            {isRequestingLink ? 'Sending link...' : 'Send Magic Link'}
          </button>
        </form>

        {!isRanked && onContinueAsGuest && (
          <div className="login-guest-section">
            <div className="login-divider"><span>or</span></div>
            <button type="button" className="btn btn-ghost btn-full" onClick={() => { onContinueAsGuest?.(); onClose?.(); }}>Continue as Guest</button>
            <p className="guest-note">Guest progress won&apos;t be saved</p>
          </div>
        )}

        {isRanked && <p className="ranked-note">⚔️ Ranked mode requires an account to track your ELO</p>}
        <button type="button" className="login-close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
    </div>
  );
}
