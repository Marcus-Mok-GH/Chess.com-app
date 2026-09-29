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
    const emailToUse = pending?.email || pendingOtpEmail;
    if (!emailToUse) {
      return setError('Session expired. Please start over.');
    }
    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email: emailToUse });
      if (!result.success) return setError(result.error);
      setSuccessMsg('New code sent! Check your email for a 6-digit code.');
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
          <h1 className="login-title">Check your email</h1>
          <p className="login-subtitle">
            We sent a 6-digit code to <strong>{pendingOtpEmail || 'your email'}</strong>
          </p>
        </div>

        <hr className="login-divider" />

        <form className="login-form" onSubmit={(e) => e.preventDefault()}>
          <div className="login-field">
            <label htmlFor="otp-code">Verification code</label>
            <input
              id="otp-code"
              type="text"
              className="login-otp-input"
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

          {error && <p className="login-error" role="alert">{error}</p>}
          {!error && successMsg && <p className="login-success" role="status">{successMsg}</p>}

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
