import { useState } from 'react';
import { Navigate } from 'react-router-dom';
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
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guard: if not awaiting verification AND not mid-submit, redirect.
  // isSubmitting is checked as a safety net: verifyEmailOtp() clears
  // isAwaitingVerification (and sets user) in one async continuation, while
  // setIsSubmitting(false) runs in the following finally block — a separate
  // microtask. Without this check a render between the two updates could see
  // isAwaitingVerification=false but user=null, causing a premature redirect
  // to /login. Suppressing the guard while still submitting closes that window.
  if (!isAwaitingVerification && !isSubmitting) {
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
    if (!/^\d{6}$/.test(otpCode)) return setError('Please enter the full 6-digit code.');

    setIsSubmitting(true);
    try {
      const result = await verifyEmailOtp({ email: pendingOtpEmail, token: otpCode });
      if (!result.success) return setError(result.error || 'Invalid or expired code. Please try again.');
      // Navigation is handled declaratively by the guard below.
      // verifyEmailOtp() sets isAwaitingVerification=false and user in the same
      // React state batch; once isSubmitting also becomes false (finally block),
      // the guard fires: <Navigate to="/home" replace />.
      // Calling navigate() here would race against those pending state updates.
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
          We sent an 6-digit code to <strong>{pendingOtpEmail}</strong>
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
