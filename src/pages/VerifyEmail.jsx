import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

const PENDING_OTP_KEY = 'chess_pending_otp';

export default function VerifyEmail() {
  const {
    isAwaitingVerification,
    isLoggedIn,
    pendingOtpEmail,
    verifyEmailOtp,
    requestOtp,
    logout,
  } = useUser();
  const navigate = useNavigate();

  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guard: if not awaiting verification, redirect to the appropriate page
  if (!isAwaitingVerification) {
    return <Navigate to={isLoggedIn ? '/home' : '/login'} replace />;
  }

  const getPendingData = () => {
    try {
      const raw = localStorage.getItem(PENDING_OTP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!otpCode.trim()) return setError('Please enter the 8-digit code.');

    setIsSubmitting(true);
    try {
      const result = await verifyEmailOtp({ email: pendingOtpEmail, token: otpCode });
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
    const pending = getPendingData();
    if (!pending?.email || !pending?.username) {
      return setError('Session expired. Please start over.');
    }
    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email: pending.email, username: pending.username });
      if (!result.success) return setError(result.error);
      setSuccessMsg('New code sent! Check your email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    await logout();
    // GlobalVerificationGuard redirects to /login once isAwaitingVerification clears
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">♟️</div>
        <h1 className="login-title">Check your email</h1>
        <p className="login-subtitle">
          We sent an 8-digit code to <strong>{pendingOtpEmail}</strong>
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
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="00000000"
              autoFocus
              autoComplete="one-time-code"
              maxLength={8}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
            />
          </div>

          {error && <p className="login-error">{error}</p>}
          {!error && successMsg && <p className="login-success">✅ {successMsg}</p>}

          <button
            type="button"
            className="login-btn"
            disabled={isSubmitting || otpCode.length !== 8}
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
              disabled={isSubmitting}
              onClick={handleCancel}
            >
              Cancel &amp; log out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
