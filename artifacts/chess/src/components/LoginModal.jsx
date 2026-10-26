import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './LoginModal.css';
import { useT } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';

export default function LoginModal({ onClose, onContinueAsGuest, mode = 'ranked' }) {
  const t = useT();
  const { requestOtp, verifyEmailOtp } = useUser();

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [step, setStep] = useState('email'); // 'email' | 'verify'
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isRanked = mode === 'ranked';

  const handleSendCode = async () => {
    setError('');
    setSuccessMsg('');
    if (!email.trim()) return setError(tNow('Please enter your email address.'));

    setIsLoading(true);
    try {
      const result = await requestOtp({ email });
      if (!result.success) return setError(result.error);
      setSuccessMsg(result.message || 'Code sent! Check your email for a 6-digit code.');
      setStep('verify');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (otpCode.length !== 6) return setError(tNow('Please enter the 6-digit code.'));

    setIsLoading(true);
    try {
      const result = await verifyEmailOtp({ email, token: otpCode });
      if (!result.success) return setError(result.error || 'Invalid or expired code. Please try again.');
      onClose?.();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setSuccessMsg('');
    setOtpCode('');
    setIsLoading(true);
    try {
      const result = await requestOtp({ email });
      if (!result.success) return setError(result.error);
      setSuccessMsg(tNow('New code sent! Check your email for a 6-digit code.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-overlay" onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
      <div className="login-modal">

        {/* Step 1: email */}
        {step === 'email' && (
          <>
            <div className="login-header">
              <h2>{t("Sign in to play")}</h2>
              <p>{t("Track your rating and keep your game history")}</p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="login-form">
              <div className="input-group">
                <label htmlFor="email">{t("Email address")}</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("your@email.com")}
                  autoComplete="email"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                />
                <small>{t("We'll send a 6-digit code to your email — no link to click.")}</small>
                {error && <span className="error-text">{t(error)}</span>}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={isLoading || !email.trim()}
                onClick={handleSendCode}
              >
                {t(isLoading ? 'Sending code...' : 'Send Code')}
              </button>
            </form>

            {!isRanked && onContinueAsGuest && (
              <div className="login-guest-section">
                <div className="login-divider"><span>{t('or')}</span></div>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  onClick={() => { onContinueAsGuest?.(); onClose?.(); }}
                >
                  {t("Continue as Guest")}</button>
                <p className="guest-note">{t("Guest progress won't be saved")}</p>
              </div>
            )}

            {isRanked && (
              <p className="ranked-note">{t("♔️ Ranked mode requires an account to track your ELO")}</p>
            )}
          </>
        )}

        {/* Step 2: enter the code */}
        {step === 'verify' && (
          <>
            <div className="login-header">
              <h2>{t("Check your email")}</h2>
              <p>
                {t("We sent a 6-digit code to")}{' '}<strong>{email}</strong>{t(". Enter it below to sign in.")}</p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="login-form">
              <div className="input-group">
                <label htmlFor="otp-code">{t("Verification code")}</label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                  maxLength={6}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                />
                {error && <span className="error-text">{t(error)}</span>}
                {!error && successMsg && <span className="success-text">{t(successMsg)}</span>}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={isLoading || otpCode.length !== 6}
                onClick={handleVerifyCode}
              >
                {t(isLoading ? 'Verifying...' : 'Verify Code')}
              </button>

              <div className="login-guest-section">
                <div className="login-divider"><span>{t("didn't get it?")}</span></div>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  disabled={isLoading}
                  onClick={handleResendCode}
                >
                  {t("Resend code")}</button>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  onClick={() => { setStep('email'); setError(''); setSuccessMsg(''); setOtpCode(''); }}
                >
                  {t("← Change email")}</button>
              </div>
            </form>
          </>
        )}

        <button
          type="button"
          className="login-close-btn"
          onClick={onClose}
          aria-label={t("Close")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
