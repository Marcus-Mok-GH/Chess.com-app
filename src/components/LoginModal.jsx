import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './LoginModal.css';

export default function LoginModal({ onClose, onSuccess, onContinueAsGuest, mode = 'ranked' }) {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(username);

      if (result?.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error('[LoginModal] Login failed:', err);
      setError(err?.message || 'Failed to login');
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose?.();
    }
  };

  const isRanked = mode === 'ranked';

  return (
    <div className="login-overlay" onKeyDown={handleKeyDown}>
      <div className="login-modal">
        <div className="login-header">
          <h2>🎮 Ready to Play?</h2>
          <p>Sign in to track your progress, earn ELO, and climb the leaderboard</p>
        </div>

        <div className="login-benefits">
          <div className="benefit-row">
            <span className="benefit-icon">📊</span>
            <span>Track your rating across games</span>
          </div>
          <div className="benefit-row">
            <span className="benefit-icon">🏆</span>
            <span>Compete on the leaderboard</span>
          </div>
          <div className="benefit-row">
            <span className="benefit-icon">💾</span>
            <span>Save your game history</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="username">Choose a username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
              autoComplete="off"
              maxLength={20}
            />
            {error && <span className="error-text">{error}</span>}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting || !username.trim()}
          >
            {isSubmitting ? 'Signing in...' : '🚀 Sign In & Play'}
          </button>
        </form>

        {!isRanked && onContinueAsGuest && (
          <div className="login-guest-section">
            <div className="login-divider">
              <span>or</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-full"
              onClick={() => {
                onContinueAsGuest?.();
                onClose?.();
              }}
            >
              Continue as Guest
            </button>
            <p className="guest-note">Guest progress won't be saved</p>
          </div>
        )}

        {isRanked && (
          <p className="ranked-note">⚔️ Ranked mode requires an account to track your ELO</p>
        )}

        <button
          type="button"
          className="login-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
