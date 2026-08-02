import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

/**
 * Render the sign-in page that collects an email and initiates an OTP request.
 *
 * The component redirects authenticated users to /home when loading completes, validates inputs,
 * calls `requestOtp` with `{ email }`, shows validation or request errors, and navigates
 * to /verify-email after a successful OTP request.
 * @returns {JSX.Element} The login page UI.
 */
export default function Login() {
  const { requestOtp, isLoggedIn, isLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');

  const [error, setError] = useState(searchParams.get('error') || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate]);

  const handleSendCode = async () => {
    setError('');
    if (!email.trim()) return setError('Please enter your email address.');

    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email });
      if (!result.success) return setError(result.error);
      // GlobalVerificationGuard picks up isAwaitingVerification and navigates to /verify-email
      navigate('/verify-email', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">♟️</div>

        <h1 className="login-title">Sign in to Chess</h1>
        <p className="login-subtitle">Enter your email to receive a sign-in code</p>

        <form className="login-form" onSubmit={(e) => e.preventDefault()}>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button
            type="button"
            className="login-btn"
            disabled={isSubmitting || !email.trim()}
            onClick={handleSendCode}
          >
            {isSubmitting ? 'Sending…' : 'Send Code'}
          </button>
        </form>
      </div>
    </div>
  );
}
