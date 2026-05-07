import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

export default function Login() {
  const { requestMagicLink, completeMagicLinkSignIn, isLoading, isLoggedIn } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isRequestingLink, setIsRequestingLink] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const encodedUsername = searchParams.get('username');
    const encodedEmail = searchParams.get('email');
    if (encodedUsername) setUsername(decodeURIComponent(encodedUsername));
    if (encodedEmail) setEmail(decodeURIComponent(encodedEmail));
  }, [searchParams]);

  const handleRequestMagicLink = async () => {
    setError('');
    setStatus('');

    if (!email.trim() || !username.trim()) {
      setError('Please enter username and email first.');
      return;
    }

    setIsRequestingLink(true);
    try {
      const result = await requestMagicLink({ email, username });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStatus(result.message || 'Magic link sent successfully.');
    } finally {
      setIsRequestingLink(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (isLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate]);

  useEffect(() => {
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const tokenHash = searchParams.get('token_hash');
    const magicType = searchParams.get('type') || 'magiclink';

    let hashToken = null;
    let hashRefreshToken = null;
    let hashType = null;

    if (window.location.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      hashToken = hashParams.get('token') || hashParams.get('access_token');
      hashRefreshToken = hashParams.get('refresh_token');
      hashType = hashParams.get('type');
    }

    const hasCallbackParams = code || token || tokenHash || hashToken;
    if (!hasCallbackParams) return;

    const callbackType = hashType || magicType;
    const normalizedType = (callbackType === 'magiclink' || callbackType === 'email') ? 'magiclink' : callbackType;

    (async () => {
      const result = await completeMagicLinkSignIn({
        username: searchParams.get('username') || username,
        email: searchParams.get('email') || email,
        token: token || undefined,
        tokenHash: tokenHash || undefined,
        accessToken: hashToken || undefined,
        refreshToken: hashRefreshToken || undefined,
        type: normalizedType,
        code: code || undefined,
      });

      if (result?.success) {
        // Clear URL parameters after successful login
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate('/home', { replace: true });
      } else {
        setError(result?.error || 'Magic link sign in failed. Request a new link.');
      }
    })();
  }, [completeMagicLinkSignIn, email, navigate, searchParams, username]);

  return (
    <div className="login-page">
      <div className="login-bg-glow"></div>
      <div className="login-grid-overlay"></div>

      <div className="login-card">
        {isLoading && (
          <div className="login-loading-overlay">
            <div className="login-spinner"></div>
            <p>Authenticating...</p>
          </div>
        )}

        <div className="login-header">
          <span className="login-logo">♟️</span>
          <h1>Welcome Back</h1>
          <p>The ultimate chess experience awaits you.</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="login-form">
          <div className="form-field">
            <label htmlFor="username">
              <span>Username</span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              maxLength={20}
              disabled={isRequestingLink || isLoading}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">
              <span>Email Address</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isRequestingLink || isLoading}
            />
            <small>We'll send a magic link to your inbox for a passwordless login.</small>
          </div>

          {error && (
            <div className="login-status error">
              <span>⚠️</span>
              {error}
            </div>
          )}

          {!error && status && (
            <div className="login-status success">
              <span>✅</span>
              {status}
            </div>
          )}

          <button
            type="button"
            className="login-button"
            disabled={isRequestingLink || isLoading || !email.trim() || !username.trim()}
            onClick={handleRequestMagicLink}
          >
            {isRequestingLink ? (
              <>
                <div className="login-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px', margin: 0 }}></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Send Magic Link</span>
                <span className="btn-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setStatus('Just enter a new username and email to sign up!'); }}>Sign up now</a></p>
        </div>
      </div>
    </div>
  );
}
