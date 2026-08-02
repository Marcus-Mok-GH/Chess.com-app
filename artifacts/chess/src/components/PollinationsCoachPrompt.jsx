import { useState } from 'react';
import { connectCoach } from '../engine/coach/coachAI';
import './PollinationsCoachPrompt.css';

const COACH_PROMPT_SHOWN_KEY = 'chess_coach_prompt_seen';

export default function PollinationsCoachPrompt({ onConnected, onBeforeConnect }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  function markSeen() {
    try { localStorage.setItem(COACH_PROMPT_SHOWN_KEY, '1'); } catch {}
    onConnected?.(false);
  }

  async function handleConnect() {
    setIsConnecting(true);
    setError('');
    try {
      await onBeforeConnect?.();
      await connectCoach();
      // After redirect, we can't detect completion here — the callback handles it.
      // Mark as seen so we don't show again on return.
      markSeen();
      onConnected?.(true);
    } catch (err) {
      setError(err.message || 'Failed to open connection.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="coach-prompt-overlay" onClick={markSeen}>
      <div className="coach-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="coach-prompt-header">
          <h2>🧠 Connect AI Coach</h2>
        </div>
        <div className="coach-prompt-body">
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
