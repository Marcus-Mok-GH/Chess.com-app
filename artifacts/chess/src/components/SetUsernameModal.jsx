import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { getCoachStatus } from '../engine/coach/coachAI';
import PollinationsCoachPrompt from './PollinationsCoachPrompt';
import './SetUsernameModal.css';

const COACH_PROMPT_SHOWN_KEY = 'chess_coach_prompt_seen';

export default function SetUsernameModal() {
  const { user, updateUsername, logout } = useUser();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCoachPrompt, setShowCoachPrompt] = useState(false);

  if (!user?.needsUsername) return null;

  async function checkAndShowCoachPrompt() {
    try {
      const status = await getCoachStatus(false);
      if (status?.available && !status?.connected) {
        const hasSeen = localStorage.getItem(COACH_PROMPT_SHOWN_KEY);
        if (!hasSeen) {
          setShowCoachPrompt(true);
          return;
        }
      }
    } catch {}
    // No prompt needed — clear the modal
    try { window.__setUsernameDone?.(); } catch {}
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (trimmed.length < 2) return setError('Username is too short (min 2 chars).');
    if (trimmed.length > 20) return setError('Username is too long (max 20 chars).');
    if (trimmed !== username) {
      return setError("Usernames can't start or end with a space.");
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      return setError('Only letters, numbers, dots (.), hyphens (-), and underscores (_) are allowed. Spaces are not allowed.');
    }

    setIsLoading(true);
    try {
      const result = await updateUsername(trimmed);
      if (result.error) {
        setError(result.error);
      } else {
        await checkAndShowCoachPrompt();
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {showCoachPrompt && (
        <PollinationsCoachPrompt onConnected={(connected) => {
          try { localStorage.setItem(COACH_PROMPT_SHOWN_KEY, '1'); } catch {}
          setShowCoachPrompt(false);
          if (!connected) {
            try { window.__setUsernameDone?.(); } catch {}
          }
        }} />
      )}
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
                onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
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
    </>
  );
}
