import { useState, useEffect } from 'react';
import { analyzeGame, isCoachAIAvailable } from '../engine/coach/coachAI';
import './GameAnalysis.css';

export default function GameAnalysis({ moveHistory, gameId = null, onClose, variant = 'modal' }) {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInline = variant === 'inline';

  useEffect(() => {
    async function checkAvailability() {
      try {
        const available = await isCoachAIAvailable();
        setIsReady(available);
      } catch (error) {
        console.error('[GameAnalysis] Failed to check coach availability:', error);
        setIsReady(false);
      } finally {
        setIsLoading(false);
      }
    }
    checkAvailability();
  }, []);

  const runAnalysis = async () => {
    if (!isReady) {
      setAnalysis('Error: AI coach not ready. Please ensure MISTRAL_API_KEY is configured.');
      return;
    }

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
          ) : !isReady ? (
            <div className="coach-error">
              <p>⚠️ AI coach unavailable</p>
              <p className="small">Please ensure MISTRAL_API_KEY is configured on the server</p>
            </div>
          ) : (
            <>
              <button onClick={runAnalysis} className="btn btn-primary">
                🔍 Start Analysis
              </button>
              <p className="coach-note">Powered by Mistral AI</p>
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
    <div className="analysis-overlay" onClick={onClose}>
      <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
        <div className="analysis-header">
          <h3>🧠 Game Analysis</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {content}
      </div>
    </div>
  );
}
