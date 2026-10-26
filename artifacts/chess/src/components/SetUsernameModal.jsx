import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './SetUsernameModal.css';
import { useT } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';

export default function SetUsernameModal() {
  const t = useT();
  const { user, updateUsername, logout } = useUser();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!user?.needsUsername) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (trimmed.length < 2) return setError(tNow('Username is too short (min 2 chars).'));
    if (trimmed.length > 20) return setError(tNow('Username is too long (max 20 chars).'));
    if (trimmed !== username) {
      return setError(tNow("Usernames can't start or end with a space."));
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      return setError(tNow('Only letters, numbers, dots (.), hyphens (-), and underscores (_) are allowed. Spaces are not allowed.'));
    }

    setIsLoading(true);
    try {
      const result = await updateUsername(trimmed);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(tNow('Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="username-overlay">
        <div className="username-modal">
          <div className="username-header">
            <h2>{t("👟 One last step!")}</h2>
            <p>{t("Please choose a username for your account.")}</p>
          </div>

          <form onSubmit={handleSubmit} className="username-form">
            <div className="input-group">
              <label htmlFor="new-username">{t("Choose a username")}</label>
              <input
                id="new-username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
                placeholder={t("e.g. ChessMaster99")}
                autoFocus
                autoComplete="off"
                maxLength={20}
                disabled={isLoading}
              />
              {error && <span className="error-text">{t(error)}</span>}
            </div>

            <button
              type="submit"
              className="btn btn-secondary btn-full"
              disabled={isLoading || !username.trim()}
            >
              {t(isLoading ? 'Setting username...' : 'Set Username')}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-full"
              onClick={logout}
              style={{ marginTop: '0.5rem' }}
            >
              {t("Cancel and Logout")}</button>
          </form>
        </div>
      </div>
  );
}
