import { useEffect, useRef, useState } from 'react';
import { connectCoach } from '../engine/coach/coachAI';
import './PollinationsCoachPrompt.css';

export default function PollinationsCoachPrompt({ onConnected, onBeforeConnect }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const connectButtonRef = useRef(null);

  useEffect(() => {
    connectButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isConnecting) onConnected?.(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnecting, onConnected]);

  function markSeen() {
    onConnected?.(false);
  }

  async function handleConnect() {
    setIsConnecting(true);
    setError('');
    try {
      await connectCoach();
    } catch (err) {
      setError(err.message || 'Failed to open connection.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="coach-prompt-overlay" role="presentation">
      <div className="coach-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="coach-prompt-title" aria-describedby="coach-prompt-description" onClick={(e) => e.stopPropagation()}>
        <div className="coach-prompt-header">
          <h2 id="coach-prompt-title">🧠 Connect AI Coach</h2>
        </div>
        <div className="coach-prompt-body" id="coach-prompt-description">
          <p className="coach-prompt-desc">
            The chess coach is powered by <strong>Pollinations AI</strong> using a{' '}
            <strong>user-pays</strong> model — you authorize your own account and control
            your spending via a consent budget.
          </p>
          <ul className="coach-prompt-list">
            <li>You will be redirected to Pollinations AI to sign in and grant access.</li>
            <li>You set a spending limit during authorization; usage beyond that is blocked.</li>
            <li>Your token is encrypted and stored securely — we never see your credentials.</li>
          </ul>
          {error && <span className="coach-prompt-error">{error}</span>}
        </div>
        <div className="coach-prompt-actions">
          <button
            type="button"
            className="btn btn-primary btn-full"
            ref={connectButtonRef}
            disabled={isConnecting}
            onClick={handleConnect}
          >
            {isConnecting ? 'Opening Pollinations…' : 'Connect Pollinations AI'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-full"
            onClick={markSeen}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
