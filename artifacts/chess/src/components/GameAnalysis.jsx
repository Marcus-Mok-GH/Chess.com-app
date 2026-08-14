import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { analyzeGame, connectCoach, disconnectCoach, getCoachStatus } from '../engine/coach/coachAI';
import './GameAnalysis.css';

export default function GameAnalysis({ moveHistory, gameId = null, onClose, variant = 'modal' }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [coachStatus, setCoachStatus] = useState(null);
  const isInline = variant === 'inline';

  useEffect(() => {
    async function checkAvailability() {
      try {
        const status = await getCoachStatus(true);
        setCoachStatus(status);
        setIsReady(Boolean(status.available && user));

      } catch (error) {
        console.error('[GameAnalysis] Failed to check coach availability:', error);
        setIsReady(false);
      } finally {
        setIsLoading(false);
      }
    }
    checkAvailability();
  }, []);

  const handleConnect = async () => {
    try {
      await connectCoach();
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.message?.toLowerCase().includes('log in')) {
        navigate('/login');
        return;
      }
      setAnalysis(`Error: ${error.message || 'Unable to open Pollinations authorization.'}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectCoach();
      setIsReady(false);
      setCoachStatus((status) => status ? { ...status, connected: false } : status);
    } catch (error) {
      setAnalysis(`Error: ${error.message || 'Unable to disconnect Pollinations.'}`);
    }
  };

  const runAnalysis = async () => {
    if (!user) { navigate('/login'); return; }

    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const result = await analyzeGame(moveHistory, null, gameId);

      if (result) {
        setAnalysis(result);
      } else {
        setAnalysis('Error: Failed to get analysis. Please try again.');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      let errorMessage = 'Error: ';

      if (error.message?.includes('network')) {
        errorMessage += 'Network error. Please check your connection and try again.';
      } else if (error.message?.includes('API')) {
        errorMessage += 'AI service error. Please try again later.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }

      setAnalysis(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const moveReviews = Array.isArray(analysis)
    ? analysis
    : analysis?.moves && Array.isArray(analysis.moves)
      ? analysis.moves
      : null;

  const summary = analysis?.summary || null;

  const content = (
    <div className="analysis-content">
      {!analysis && !isAnalyzing && (
        <div className="analysis-start">
          <p>Analyze your game with AI coach</p>
          {isLoading ? (
            <div className="coach-loading">
              <div className="spinner"></div>
              <p>Connecting to AI coach...</p>
            </div>
          ) : coachStatus?.configured === false && !coachStatus?.connected ? (
            <div className="coach-error">
              <p>⚠️ AI coach is not configured</p>
              <p className="small">The server needs a Pollinations App Key and token encryption secret.</p>
            </div>
          ) : !isReady ? (
            !user ? (
              <div className="coach-error">
                <p>🔒 Log in to use AI coach</p>
                <p className="small">Sign in to access Pollinations AI coaching.</p>
                <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ marginTop: '8px' }}>Log In</button>
              </div>
            ) : (
              <div className="coach-error">
                <p>⚠️ Connect the Pollinations AI coach</p>
                <p className="small">Your approved budget is used for the primary model first. If it is unavailable, the coach falls back to a free Pollinations model.</p>
                <button type="button" onClick={handleConnect} className="btn btn-primary">
                  Connect Pollinations
                </button>
              </div>
            )
          ) : (
            <>
              <button onClick={runAnalysis} className="btn btn-primary">
                🔍 Start Analysis
              </button>
              <button type="button" onClick={handleDisconnect} className="btn btn-secondary">
                Disconnect
              </button>
              <p className="coach-note">Powered by Pollinations AI · free fallback available</p>
            </>
          )}
        </div>
      )}
      {isAnalyzing && (
        <div className="analysis-loading">
          <div className="spinner"></div>
          <p>AI is analyzing your game...</p>
        </div>
      )}
      {analysis && (
        <div className="analysis-result">
          {summary && (
            <div className="analysis-summary">
              {summary}
            </div>
          )}
          {moveReviews ? (
            <div className="analysis-move-reviews">
              {moveReviews.map((entry, index) => {
                const color = entry?.color === 'black' ? 'black' : 'white';
                const moveNumber = Number.isFinite(entry?.moveNumber)
                  ? entry.moveNumber
                  : Math.floor(index / 2) + 1;
                const moveLabel = `${moveNumber}${color === 'black' ? '...' : '.'}`;
                const san = entry?.san || '';
                const review = entry?.review || entry?.comment || entry?.analysis || '';
                return (
                  <div key={`${moveLabel}-${index}`} className="analysis-move-review">
                    <div className="analysis-move-review-header">
                      <span className={`analysis-move-review-color ${color}`}>
                        {moveLabel}
                      </span>
                      <span className="analysis-move-review-san">{san || '—'}</span>
                    </div>
                    <p className="analysis-move-review-text">{review || 'No review available.'}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="analysis-text">{analysis}</div>
          )}
          {!isAnalyzing && (
            <button onClick={runAnalysis} className="btn btn-secondary">
              🔄 Re-analyze
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (isInline) {
    return <div className="analysis-inline">{content}</div>;
  }

  return (
    <>
      <div className="analysis-overlay" onClick={onClose}>
        <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
          <div className="analysis-header">
            <h3>🧠 Game Analysis</h3>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×</button>
          </div>
          {content}
        </div>
      </div>
    </>
  );
}
