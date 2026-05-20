import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './LoginModal.css';

export default function LoginModal({ onClose, onContinueAsGuest, mode = 'ranked' }) {
  const { requestOtp, verifyEmailOtp } = useUser();

  const [username, setUsername] = useState('');
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
    if (!email.trim()) return setError('Please enter your email address.');
    if (!username.trim()) return setError('Please choose a username.');

    setIsLoading(true);
    try {
      const result = await requestOtp({ email, username });
      if (!result.success) return setError(result.error);
      setSuccessMsg(result.message || 'Code sent! Check your email for a 6-digit code.');
      setStep('verify');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (otpCode.length !== 6) return setError('Please enter the 6-digit code.');

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
      const result = await requestOtp({ email, username });
      if (!result.success) return setError(result.error);
      setSuccessMsg('New code sent! Check your email for a 6-digit code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-overlay" onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
      <div className="login-modal">

        {/* Step 1: email + username */}
        {step === 'email' && (
          <>
            <div className="login-header">
              <h2>♟️ Ready to Play?</h2>
              <p>Sign in to track your progress, earn ELO, and climb the leaderboard</p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="login-form">
              <div className="input-group">
                <label htmlFor="username">Choose a username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoFocus
                  autoComplete="off"
                  maxLength={20}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                />
                <small>We'll send a 6-digit code to your email — no link to click.</small>
                {error && <span className="error-text">{error}</span>}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={isLoading || !username.trim() || !email.trim()}
                onClick={handleSendCode}
              >
                {isLoading ? 'Sending code...' : 'Send Code'}
              </button>
            </form>

            {!isRanked && onContinueAsGuest && (
              <div className="login-guest-section">
                <div className="login-divider"><span>or</span></div>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  onClick={() => { onContinueAsGuest?.(); onClose?.(); }}
                >
                  Continue as Guest
                </button>
                <p className="guest-note">Guest progress won't be saved</p>
              </div>
            )}

            {isRanked && (
              <p className="ranked-note">♔️ Ranked mode requires an account to track your ELO</p>
            )}
          </>
        )}

        {/* Step 2: enter the code */}
        {step === 'verify' && (
          <>
            <div className="login-header">
              <h2>Check your email</h2>
              <p>
                We sent a 6-digit code to <strong>{email}</strong>.
                Enter it below to sign in.
              </p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="login-form">
              <div className="input-group">
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
                {error && <span className="error-text">{error}</span>}
                {!error && successMsg && <span className="success-text">✅ {successMsg}</span>}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={isLoading || otpCode.length !== 6}
                onClick={handleVerifyCode}
              >
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </button>

              <div className="login-guest-section">
                <div className="login-divider"><span>didn't get it?</span></div>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  disabled={isLoading}
                  onClick={handleResendCode}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  onClick={() => { setStep('email'); setError(''); setSuccessMsg(''); setOtpCode(''); }}
                >
                  ← Change email
                </button>
              </div>
            </form>
          </>
        )}

        <button
          type="button"
          className="login-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}