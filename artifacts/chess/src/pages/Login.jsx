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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add state for success feedback
  const [emailSent, setEmailSent] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate]);

  const validateEmail = (value) => {
    if (!value.trim()) return false;
    // Basic email regex
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value);
  };

  const handleSendCode = async () => {
    setError('');
    setEmailSent(false);
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
      // Show success message
      setEmailSent(true);
      // GlobalVerificationGuard picks up isAwaitingVerification and navigates to /verify-email
      navigate('/verify-email', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
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
        <div className="login-logo">♟️</div>

        <h1 className="login-title">Sign in to Chess</h1>
        <p className="login-subtitle">We'll email you a 6-digit code to sign in</p>

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
              aria-describedby={error ? 'email-error' : undefined}
              aria-invalid={error ? 'true' : undefined}
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
            By signing in, you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </div>
        </form>
      </div>
    </div>
  );
}
