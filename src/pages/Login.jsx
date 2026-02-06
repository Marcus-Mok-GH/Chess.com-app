import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import WelcomeModal from '../components/WelcomeModal';
import './Login.css';

export default function Login() {
  const { login, isLoading, saveOnboardingAnswers } = useUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [newUserData, setNewUserData] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(username);
      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
      } else {
        // Show welcome modal for new users
        if (result.isNewUser) {
          setNewUserData(result.user);
          setShowWelcome(true);
          setIsSubmitting(false);
        } else {
          // Navigate to home page for existing users
          navigate('/home');
        }
      }
    } catch (err) {
      setError('Login failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleWelcomeComplete = async (answers) => {
    try {
      await saveOnboardingAnswers(answers);
    } catch (err) {
      console.error('Failed to save onboarding answers:', err);
    }
    // Navigate to home regardless of save success
    setShowWelcome(false);
    navigate('/home');
  };

  const handleWelcomeSkip = () => {
    setShowWelcome(false);
    navigate('/home');
  };

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <h1>♟️ Chess</h1>
            <p>Enter your username to play</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                maxLength={20}
                disabled={isSubmitting}
                autoFocus
              />
              <small>
                3-20 characters, letters, numbers, and underscores only
              </small>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-btn"
              disabled={isSubmitting || !username.trim()}
            >
              {isSubmitting ? 'Logging in...' : 'Play Chess'}
            </button>
          </form>

          <div className="login-footer">
            <p>Your games will be saved to your account</p>
          </div>
        </div>
      </div>

      {showWelcome && newUserData && (
        <WelcomeModal
          username={newUserData.username}
          onComplete={handleWelcomeComplete}
          onSkip={handleWelcomeSkip}
        />
      )}
    </>
  );
}
