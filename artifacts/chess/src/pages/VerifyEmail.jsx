import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';
import { useT } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';
import { consumePostLoginPath } from '../utils/postLoginPath';
import BrandLogo from '../components/BrandLogo';

const PENDING_OTP_KEY = 'chess_pending_otp';

export default function VerifyEmail() {
  const t = useT();
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
  // Read once on mount: the path a guest was blocked from, if any. Held in
  // state because the sessionStorage entry is cleared on read.
  const [postLoginPath] = useState(consumePostLoginPath);

  // Guard: if not awaiting verification AND not mid-submit, redirect.
  // isSubmitting is checked as a safety net: verifyEmailOtp() clears
  // isAwaitingVerification (and sets user) in one async continuation, while
  // setIsSubmitting(false) runs in the following finally block — a separate
  // microtask. Without this check a render between the two updates could see
  // isAwaitingVerification=false but user=null, causing a premature redirect
  // to /login. Suppressing the guard while still submitting closes that window.
  if (!isAwaitingVerification && !isSubmitting) {
    return <Navigate to={isLoggedIn ? postLoginPath : '/login'} replace />;
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
    if (!/^\d{6}$/.test(otpCode)) return setError(tNow('Please enter the full 6-digit code.'));

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
      return setError(tNow('Session expired. Please start over.'));
    }
    setIsSubmitting(true);
    try {
      const result = await requestOtp({ email: emailToUse });
      if (!result.success) return setError(result.error);
      setSuccessMsg(tNow('New code sent! Check your email for a 6-digit code.'));
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
          <BrandLogo />
        </div>

        <div className="login-header">
          <span className="login-eyebrow">{t("PlayChess")}</span>
          <h1 className="login-title">{t("Check your email")}</h1>
          <p className="login-subtitle">
            {t("We sent a 6-digit code to")}{' '}<strong>{pendingOtpEmail || 'your email'}</strong>
          </p>
        </div>

        <hr className="login-divider" />

        <form className="login-form" onSubmit={(e) => e.preventDefault()}>
          <div className="login-field">
            <label htmlFor="otp-code">{t("Verification code")}</label>
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

          {error && <p className="login-error" role="alert">{t(error)}</p>}
          {!error && successMsg && <p className="login-success" role="status">{t(successMsg)}</p>}

          <button
            type="button"
            className="login-btn"
            disabled={isSubmitting || otpCode.length !== 6}
            onClick={handleVerifyCode}
          >
            {t(isSubmitting ? 'Verifying…' : 'Verify Code')}
          </button>

          <div className="login-secondary-actions">
            <button
              type="button"
              className="login-link-btn"
              disabled={isSubmitting}
              onClick={handleResendCode}
            >
              {t("Resend code")}</button>
            <span className="login-divider-dot">·</span>
            <button
              type="button"
              className="login-link-btn"
              disabled={isSubmitting}
              onClick={handleCancel}
            >
              {t("Cancel & log out")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
