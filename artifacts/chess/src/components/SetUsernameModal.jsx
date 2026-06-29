import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './SetUsernameModal.css';

export default function SetUsernameModal() {
  const { user, updateUsername, logout } = useUser();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!user?.needsUsername) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const trimmed = username.trim();
    if (trimmed.length < 2) return setError('Username must be at least 2 characters.');
    if (trimmed.length > 20) return setError('Username must be 20 characters or less.');
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return setError('Letters, numbers, and underscores only.');

    setIsLoading(true);
    try {
      const result = await updateUsername(trimmed);
      if (result.error) setError(result.error);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="username-overlay">
      <div className="username-modal">
        <div className="username-header">
          <h2>👟 One last step!</h2>
          <p>Please choose a username for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="username-form">
          <div className="input-group">
            <label htmlFor="new-username">Choose a username</label>
            <input
              id="new-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ChessMaster99"
              autoFocus
              autoComplete="off"
              maxLength={20}
              disabled={isLoading}
            />
            {error && <span className="error-text">{error}</span>}
          </div>

          <button
            type="submit"
            className="btn btn-secondary btn-full"
            disabled={isLoading || !username.trim()}
          >
            {isLoading ? 'Setting username...' : 'Set Username'}
          </button>
          
          <button
            type="button"
            className="btn btn-ghost btn-full"
            onClick={logout}
            style={{ marginTop: '0.5rem' }}
          >
            Cancel and Logout
          </button>
        </form>
      </div>
    </div>
  );
}
