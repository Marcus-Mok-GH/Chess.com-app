import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

export default function Login() {
  const { login, requestLoginOtp, isLoading } = useUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [otpStatus, setOtpStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !email.trim() || !otp.trim()) {
      setError('Please enter username, email, and the OTP code');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ username, email, otp });
      if (!result.success) {
        setError(result.error);
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestOtp = async () => {
    setError('');
    setOtpStatus('');
    if (!email.trim()) {
      setError('Please enter your email first.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter a username first.');
      return;
    }

    setIsRequestingOtp(true);
    try {
      const result = await requestLoginOtp({ email, username });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOtpRequested(true);
      setOtpStatus(result.message || 'Code sent successfully.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  if (isLoading) return <div className="login-page"><div className="login-container"><div className="login-loading"><div className="spinner"></div><p>Loading...</p></div></div></div>;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>♟️ Chess</h1>
          <p>Sign in with Supabase email OTP</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" maxLength={20} disabled={isSubmitting || isRequestingOtp} autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={isSubmitting || isRequestingOtp} />
          </div>
          <div className="form-group">
            <label htmlFor="otp">Email OTP code</label>
            <input id="otp" type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit code" disabled={isSubmitting || isRequestingOtp || !otpRequested} maxLength={6} />
            <small>Request a one-time code sent to your email, then enter the code to sign in.</small>
          </div>

          {error && <div className="error-message">{error}</div>}
          {!error && otpStatus && <div className="success-message">✅ {otpStatus}</div>}

          <button type="button" className="login-btn" disabled={isSubmitting || isRequestingOtp || !email.trim() || !username.trim()} onClick={handleRequestOtp}>
            {isRequestingOtp ? 'Sending code...' : (otpRequested ? 'Resend OTP Code' : 'Send OTP Code')}
          </button>

          <button type="submit" className="login-btn" disabled={isSubmitting || !username.trim() || !email.trim() || !otp.trim() || !otpRequested}>
            {isSubmitting ? 'Signing in...' : 'Verify OTP & Play'}
          </button>
        </form>
      </div>
    </div>
  );
}
