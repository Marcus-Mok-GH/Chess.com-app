import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './Login.css';

export default function Login() {
  const { login, isLoading } = useUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !email.trim() || !password.trim()) {
      setError('Please enter username, email, and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ username, email, password });
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

  if (isLoading) return <div className="login-page"><div className="login-container"><div className="login-loading"><div className="spinner"></div><p>Loading...</p></div></div></div>;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>♟️ Chess</h1>
          <p>Sign in with Supabase</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" maxLength={20} disabled={isSubmitting} autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={isSubmitting} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" disabled={isSubmitting} />
            <small>New users are created automatically on first sign-in attempt.</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn" disabled={isSubmitting || !username.trim() || !email.trim() || !password.trim()}>
            {isSubmitting ? 'Signing in...' : 'Sign In & Play'}
          </button>
        </form>
      </div>
    </div>
  );
}
