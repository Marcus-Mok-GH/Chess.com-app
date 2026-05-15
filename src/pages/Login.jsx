import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

export default function Login() {
  const { requestOtp, verifyEmailOtp, isLoggedIn, isLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [step, setStep] = useState('email'); // 'email' | 'verify'
  const [error, setError] = useState(searchParams.get('error') || '');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate]);

  const handleSendCode = async () => {
    setError('');
    setSuccessMsg('');
    if (!email.trim()) return setError('Please enter your email address.');
    if (!username.trim()) return setError('Please choose a username.');

    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email, username });
      if (!result.success) return setError(result.error);
      setSuccessMsg(result.message || 'Code sent! Check your email.');
      setStep('verify');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!otpCode.trim()) return setError('Please enter the 6-digit code.');

    setIsSubmitting(true);
    try {
      const result = await verifyEmailOtp({ email, token: otpCode });
      if (!result.success) return setError(result.error || 'Invalid or expired code. Please try again.');
      navigate('/home', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setSuccessMsg('');
    setOtpCode('');
    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email, username });
      if (!result.success) return setError(result.error);
      setSuccessMsg('New code sent! Check your email.');
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

        {step === 'email' && (
          <>
            <h1 className="login-title">Sign in to Chess</h1>
            <p className="login-subtitle">Enter your username and email to receive a sign-in code</p>

            <form className="login-form" onSubmit={(e) => e.preventDefault()}>
              <div className="login-field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoFocus
                  autoComplete="off"
                  maxLength={20}
                />
              </div>

              <div className="login-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                />
              </div>

              {error && <p className="login-error">{error}</p>}

              <button
                type="button"
                className="login-btn"
                disabled={isSubmitting || !username.trim() || !email.trim()}
                onClick={handleSendCode}
              >
                {isSubmitting ? 'Sending…' : 'Send Code'}
              </button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <h1 className="login-title">Check your email</h1>
            <p className="login-subtitle">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            <form className="login-form" onSubmit={(e) => e.preventDefault()}>
              <div className="login-field">
                <label htmlFor="otp-code">Verification code</label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                  maxLength={6}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                />
              </div>

              {error && <p className="login-error">{error}</p>}
              {!error && successMsg && <p className="login-success">✅ {successMsg}</p>}

              <button
                type="button"
                className="login-btn"
                disabled={isSubmitting || otpCode.length !== 6}
                onClick={handleVerifyCode}
              >
                {isSubmitting ? 'Verifying…' : 'Verify Code'}
              </button>

              <div className="login-secondary-actions">
                <button
                  type="button"
                  className="login-link-btn"
                  disabled={isSubmitting}
                  onClick={handleResendCode}
                >
                  Resend code
                </button>
                <span className="login-divider-dot">·</span>
                <button
                  type="button"
                  className="login-link-btn"
                  onClick={() => {
                    setStep('email');
                    setError('');
                    setSuccessMsg('');
                    setOtpCode('');
                  }}
                >
                  ← Change email
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
