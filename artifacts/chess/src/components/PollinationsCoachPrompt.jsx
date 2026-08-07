import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './PollinationsCoachPrompt.css';

export default function PollinationsCoachPrompt({ mode = 'connect', onConnected }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const seenRef = useRef(false);

  useEffect(() => {
    function onMessage(event) {
      if (event?.data?.type === 'coach_connected') {
        seenRef.current = true;
        onConnected?.();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onConnected]);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const data = await (await import('../engine/coach/coachAI')).connectCoach();
      if (!data.authorizationUrl) throw new Error('Pollinations connection URL was not returned.');
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setError(err.message || 'Unable to open Pollinations authorization.');
      setIsConnecting(false);
    }
  }

  function handleLogin() {
    seenRef.current = true;
    onConnected?.();
    navigate('/login');
  }

  function handleDismiss() {
    seenRef.current = true;
    onConnected?.();
  }

  const isLogin = mode === 'login';

  return (
    <div className="coach-prompt-overlay" role="presentation">
      <div className="coach-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="coach-prompt-title" aria-describedby="coach-prompt-description" onClick={(e) => e.stopPropagation()}>
        <div className="coach-prompt-header">
          <h2 id="coach-prompt-title">{isLogin ? '🔒 Sign in to use AI Coach' : '🧠 Connect AI Coach'}</h2>
        </div>
        <div className="coach-prompt-body" id="coach-prompt-description">
          <p className="coach-prompt-desc">
            {isLogin
              ? 'The AI coach is powered by Pollinations AI. Sign in to your chess account to connect your personal Pollinations authorization and start improving your game.'
              : 'The chess coach is powered by <strong>Pollinations AI</strong> using a secure OAuth connection tied to your chess account.'}
          </p>
          {!isLogin && (
            <ul className="coach-prompt-list">
              <li>You will be redirected to Pollinations AI to sign in and grant access.</li>
              <li>Your authorization is stored per account and can be disconnected anytime.</li>
            </ul>
          )}
          {error && <span className="coach-prompt-error">{error}</span>}
        </div>
        <div className="coach-prompt-actions">
          {isLogin ? (
            <>
              <button type="button" className="btn btn-primary btn-full" onClick={handleLogin}>
                Sign In
              </button>
              <button type="button" className="btn btn-ghost btn-full" onClick={handleDismiss}>
                Not now
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-full" onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? 'Opening Pollinations...' : 'Connect Pollinations AI'}
              </button>
              <button type="button" className="btn btn-ghost btn-full" onClick={handleDismiss}>
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
