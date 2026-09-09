import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { analyzeGame, connectCoach, disconnectCoach, getCoachStatus } from '../engine/coach/coachAI';
import './GameAnalysis.css';

const LABELS = [
  ['blunder', 'Blunder'],
  ['mistake', 'Mistake'],
  ['miss', 'Miss'],
  ['inaccuracy', 'Inaccuracy'],
  ['brilliant', 'Brilliant'],
  ['great', 'Great'],
  ['best', 'Best'],
  ['excellent', 'Excellent'],
  ['book', 'Book'],
  ['good', 'Good'],
];

function getMoveLabel(entry) {
  const explicit = String(entry?.classification || entry?.label || '').trim();
  if (explicit) return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase();

  const text = String(entry?.review || entry?.comment || entry?.analysis || '').toLowerCase();
  return LABELS.find(([needle]) => text.includes(needle))?.[1] || 'Reviewed';
}

function isKeyMoment(label) {
  return ['Blunder', 'Mistake', 'Miss', 'Inaccuracy', 'Brilliant', 'Great'].includes(label);
}

function getPly(entry, index) {
  const ply = Number(entry?.ply);
  if (Number.isFinite(ply) && ply > 0) return ply;
  return index + 1;
}

export default function GameAnalysis({
  moveHistory,
  gameId = null,
  onClose,
  onSelectMove,
  variant = 'modal',
}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [coachStatus, setCoachStatus] = useState(null);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [showAllMoves, setShowAllMoves] = useState(false);
  const isInline = variant === 'inline';

  useEffect(() => {
    async function checkAvailability() {
      try {
        const status = await getCoachStatus(true);
        setCoachStatus(status);
        setIsReady(Boolean(status.available && status.connected && user));

      } catch (error) {
        console.error('[GameAnalysis] Failed to check coach availability:', error);
        setIsReady(false);
      } finally {
        setIsLoading(false);
      }
    }
    checkAvailability();
  }, [user?.username]);

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
    setAuthPrompt(false);

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

      if (error.code === 'POLLINATIONS_AUTH_REQUIRED' || error.status === 402) {
        errorMessage += 'Pollinations AI login is required for successful analysis. Please log in with Pollinations AI and try again.';
        setAuthPrompt(true);
        setIsReady(false);
        setCoachStatus((status) => status ? { ...status, connected: false } : status);
      } else if (error.message?.includes('network')) {
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
  const labeledMoves = moveReviews?.map((entry, index) => ({
    entry,
    index,
    label: getMoveLabel(entry),
    ply: getPly(entry, index),
  })) || [];
  const keyMoments = labeledMoves.filter(({ label }) => isKeyMoment(label));
  const visibleMoves = showAllMoves ? labeledMoves : keyMoments;
  const accuracy = Number(analysis?.accuracy ?? analysis?.summary?.accuracy);
  const hasAccuracy = Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100;
  const generatedSummary = keyMoments.length
    ? `${keyMoments.length} key moment${keyMoments.length === 1 ? '' : 's'} to revisit. Select one to load the position on the board.`
    : `The coach reviewed ${labeledMoves.length} move${labeledMoves.length === 1 ? '' : 's'} and did not flag a critical moment.`;

  const content = (
    <div className="analysis-content">
      {!analysis && !isAnalyzing && (
        <div className="analysis-start">
            <p className="analysis-start-kicker">GAME REVIEW</p>
            <h4>Find the moments that changed the game</h4>
            <p>Get a highlights report, move labels, and coach explanations you can follow on the board.</p>
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
                 🔍 Start Game Review
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
          {(summary || moveReviews) && (
            <section className="review-highlights">
              <div className="review-section-heading">
                <div>
                  <span className="review-eyebrow">HIGHLIGHTS</span>
                  <h4>What changed the game</h4>
                </div>
                <span className="review-engine-note">
                  {hasAccuracy ? 'Engine score included' : 'Coach review · engine score not available'}
                </span>
              </div>
              <div className="review-stat-grid">
                <div className="review-stat">
                  <strong>{labeledMoves.length}</strong>
                  <span>Moves reviewed</span>
                </div>
                <div className="review-stat">
                  <strong>{keyMoments.length}</strong>
                  <span>Key moments</span>
                </div>
                <div className="review-stat">
                  <strong>{hasAccuracy ? `${Math.round(accuracy)}%` : '—'}</strong>
                  <span>{hasAccuracy ? 'Accuracy' : 'Accuracy unavailable'}</span>
                </div>
              </div>
              <p className="analysis-summary">{summary || generatedSummary}</p>
            </section>
          )}
          {moveReviews ? (
            <>
              <div className="review-coach-card">
                <div className="review-coach-avatar">♟</div>
                <div>
                  <span className="review-eyebrow">COACH</span>
                  <p>{summary || 'Start with a key moment, then use the move list to compare the rest of the game.'}</p>
                </div>
              </div>
              {keyMoments.length > 0 && (
                <div className="review-key-moments">
                  <div className="review-list-heading">
                    <h4>Key moments</h4>
                    <span>{keyMoments.length} flagged</span>
                  </div>
                  <div className="key-moment-list">
                    {keyMoments.map(({ entry, index, label, ply }) => {
                      const color = entry?.color === 'black' ? 'black' : 'white';
                      const moveNumber = Number.isFinite(entry?.moveNumber)
                        ? entry.moveNumber
                        : Math.floor(index / 2) + 1;
                      const moveLabel = `${moveNumber}${color === 'black' ? '...' : '.'}`;
                      return (
                        <button
                          type="button"
                          key={`key-${moveLabel}-${index}`}
                          className={`key-moment key-moment-${label.toLowerCase()}`}
                          onClick={() => onSelectMove?.(ply)}
                        >
                          <span className="key-moment-move">{moveLabel} {entry?.san || '—'}</span>
                          <span className="key-moment-label">{label}</span>
                          <span className="key-moment-arrow">→</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="analysis-move-reviews">
                <div className="review-list-heading">
                  <h4>{showAllMoves ? 'All moves' : 'Flagged moves'}</h4>
                  {labeledMoves.length > keyMoments.length && (
                    <button
                      type="button"
                      className="review-text-button"
                      onClick={() => setShowAllMoves((value) => !value)}
                    >
                      {showAllMoves ? 'Show key moments' : `Show all ${labeledMoves.length} moves`}
                    </button>
                  )}
                </div>
                {visibleMoves.length === 0 && (
                  <p className="review-empty">No critical moves were flagged. Open All moves to read the coach notes.</p>
                )}
                {visibleMoves.map(({ entry, index, label, ply }) => {
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
                        <span className={`analysis-move-label move-label-${label.toLowerCase()}`}>{label}</span>
                    </div>
                    <p className="analysis-move-review-text">{review || 'No review available.'}</p>
                      <button
                        type="button"
                        className="review-jump-button"
                        onClick={() => onSelectMove?.(ply)}
                      >
                        Review on board →
                      </button>
                  </div>
                );
              })}
              </div>
            </>
          ) : (
            <div className="analysis-text">{analysis}</div>
          )}
          {authPrompt && (
            <button type="button" onClick={handleConnect} className="btn btn-primary">
              Log in with Pollinations AI
            </button>
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
