import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cpu } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import './Login.css';
import { useT } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';
import { consumePostLoginPath } from '../utils/postLoginPath';
import BrandLogo from '../components/BrandLogo';

/**
 * Render the sign-in page that collects an email and initiates an OTP request.
 *
 * The component redirects authenticated users to /home when loading completes, validates inputs,
 * calls `requestOtp` with `{ email }`, shows validation or request errors, and navigates
 * to /verify-email after a successful OTP request.
 * @returns {JSX.Element} The login page UI.
 */
export default function Login() {
  const t = useT();
  const { requestOtp, isLoggedIn, isLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [emailInvalid, setEmailInvalid] = useState(false);

  const [error, setError] = useState(searchParams.get('error') || '');
  const isSignupIntent = searchParams.get('mode') === 'signup';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in — back to the page a guest was blocked from,
  // or /home when the visit was a plain sign-in.
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate(consumePostLoginPath(), { replace: true });
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
      setError(tNow('Please enter your email address.'));
      return;
    }
    if (!validateEmail(email)) {
      setError(tNow('Please enter a valid email address.'));
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
          <BrandLogo />
        </div>

        <div className="login-header">
          <span className="login-eyebrow">{t("PlayChess")}</span>
          <h1 className="login-title">{t(isSignupIntent ? 'Create an account' : 'Log in')}</h1>
          <p className="login-subtitle">{t(isSignupIntent ? 'Pick a username, get a rating, start playing.' : "Enter your email and we'll send a code.")}</p>
        </div>

        <hr className="login-divider" />

        <form className="login-form" onSubmit={(e) => e.preventDefault()}>
          <div className="login-field">
            <label htmlFor="email">{t("Email")}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder={t("your@email.com")}
              autoComplete="email"
              autoFocus
              aria-describedby={error ? 'email-error' : emailInvalid ? 'login-validator' : undefined}
              aria-invalid={error ? 'true' : emailInvalid ? 'true' : undefined}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
            />
          </div>

          {error && <p id="email-error" className="login-error" role="alert">{t(error)}</p>}
          {emailInvalid && !error && <p className="login-validator">{t("Please enter a valid email address")}</p>}

          <button
            type="button"
            className="login-btn"
            disabled={isSubmitting || !email.trim() || emailInvalid}
            onClick={handleSendCode}
          >
            {t(isSubmitting ? 'Sending…' : 'Send Code')}
          </button>

          <div className="login-legal">
            {t("By")}{' '}{t(isSignupIntent ? 'creating an account' : 'signing in')}{t(", you agree to our")}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">{t("Terms")}</a>{' '}
            {t('and')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">{t("Privacy Policy")}</a>.
          </div>
        </form>

        {/* The account wall is not a dead end: the board works without an
            account, so a visitor who only came to try the site keeps playing
            instead of bouncing at the email box. */}
        <div className="login-guest">
          <p className="login-guest-copy">
            {t("Just want to try it? Play a bot now, no account needed.")}
          </p>
          <button
            type="button"
            className="login-guest-btn"
            onClick={() => navigate('/play')}
          >
            <Cpu size={16} />
            {t("Play a bot now")}
          </button>
        </div>
      </div>
    </div>
  );
}
