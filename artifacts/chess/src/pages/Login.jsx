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
  const [emailInvalid, setEmailInvalid] = useState(false);

  const [error, setError] = useState(searchParams.get('error') || '');
  const isSignupIntent = searchParams.get('mode') === 'signup';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate]);

  const validateEmail = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    // Basic email regex
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(trimmed);
  };

  const handleSendCode = async () => {
    if (isSubmitting) return;
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // GlobalVerificationGuard picks up isAwaitingVerification and navigates to /verify-email
      navigate('/verify-email', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    setError('');
    // Real-time validation for non-empty values
    if (value && !validateEmail(value)) {
      setEmailInvalid(true);
    } else {
      setEmailInvalid(false);
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
        <div className="login-logo">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M32 4c-1.5 0-2.75 1-3.2 2.4C27.5 7.2 26 9 26 11c0 1.5.7 2.8 1.8 3.7-.5.8-1.3 1.8-2.3 2.8C23 20 19.5 22 16 23c-1 .3-1.5 1.3-1.2 2.3.3 1 1.3 1.5 2.3 1.2 2.5-.7 4.8-1.8 6.9-3.2V28H14c-1.1 0-2 .9-2 2s.9 2 2 2h4l-4 20H12c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h40c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2h-2l-4-20h4c1.1 0 2-.9 2-2s-.9-2-2-2H40v-4.7c2.1 1.4 4.4 2.5 6.9 3.2 1 .3 2-.2 2.3-1.2.3-1-.2-2-1.2-2.3-3.5-1-7-3-9.5-5.5-1-.9-1.8-2-2.3-2.8C37.3 13.8 38 12.5 38 11c0-2-1.5-3.8-2.8-4.6C34.75 5 33.5 4 32 4zm-6 48l4-20h4l4 20H26z"
              fill="#81b64c"
            />
          </svg>
        </div>

        <div className="login-header">
          <span className="login-eyebrow">PlayChess</span>
          <h1 className="login-title">{isSignupIntent ? 'Create Your Account' : 'Welcome Back'}</h1>
          <p className="login-subtitle">{isSignupIntent ? 'Start playing on PlayChess' : 'Sign in to your PlayChess account'}</p>
        </div>

        <hr className="login-divider" />

        <form className="login-form" onSubmit={(e) => e.preventDefault()}>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
              aria-describedby={error ? 'email-error' : emailInvalid ? 'login-validator' : undefined}
              aria-invalid={error ? 'true' : emailInvalid ? 'true' : undefined}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
            />
          </div>

          {error && <p id="email-error" className="login-error" role="alert">{error}</p>}
          {emailInvalid && !error && <p className="login-validator">Please enter a valid email address</p>}

          <button
            type="button"
            className="login-btn"
            disabled={isSubmitting || !email.trim() || emailInvalid}
            onClick={handleSendCode}
          >
            {isSubmitting ? 'Sending…' : 'Send Code'}
          </button>

          <div className="login-legal">
            By {isSignupIntent ? 'creating an account' : 'signing in'}, you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </div>
        </form>
      </div>
    </div>
  );
}
