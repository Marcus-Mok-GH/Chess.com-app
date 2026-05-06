import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

export default function Login() {
  const { requestMagicLink, completeMagicLinkSignIn, isLoading } = useUser();
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
    const token = searchParams.get('token');
    const tokenHash = searchParams.get('token_hash');
    const magicType = searchParams.get('type') || 'magiclink';

    let hashToken = null;
    let hashType = null;
    if (window.location.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      hashToken = hashParams.get('token');
      hashType = hashParams.get('type');
    }

    const callbackToken = token || tokenHash || hashToken;
    const callbackType = hashType || magicType;
    if (!callbackToken || callbackType !== 'magiclink') return;

    (async () => {
      const result = await completeMagicLinkSignIn({
        username: searchParams.get('username') || username,
        email: searchParams.get('email') || email,
        token: token || hashToken || undefined,
        tokenHash: tokenHash || undefined,
        type: callbackType,
      });
      if (result?.success) {
        navigate('/home', { replace: true });
      } else {
        setError(result?.error || 'Magic link sign in failed. Request a new link.');
      }
    })();
  }, [completeMagicLinkSignIn, email, navigate, searchParams, username]);

  if (isLoading) return <div className="login-page"><div className="login-container"><div className="login-loading"><div className="spinner"></div><p>Loading...</p></div></div></div>;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>♟️ Chess</h1>
          <p>Sign in with an email magic link</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" maxLength={20} disabled={isRequestingLink} autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={isRequestingLink} />
            <small>We will email a secure magic link. Click it to automatically sign in and continue.</small>
          </div>

          {error && <div className="error-message">{error}</div>}
          {!error && status && <div className="success-message">✅ {status}</div>}

          <button type="button" className="login-btn" disabled={isRequestingLink || !email.trim() || !username.trim()} onClick={handleRequestMagicLink}>
            {isRequestingLink ? 'Sending link...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
