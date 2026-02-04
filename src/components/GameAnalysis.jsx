import { useState, useEffect, useMemo } from 'react';
import { analyzeGame, isCoachAIAvailable } from '../engine/coach/coachAI';
import { toSanHistory } from '../engine/game/moveHistory';
import './GameAnalysis.css';

function extractJson(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch {
        // fallthrough
      }
    }

    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1));
      } catch {
        // fallthrough
      }
    }
  }

  return null;
}

function normalizeMoveReviews(rawMoves, sanMoves) {
  return rawMoves.map((entry, index) => {
    const color = entry?.color === 'black' || index % 2 === 1 ? 'black' : 'white';
    const moveNumber = Number.isFinite(entry?.moveNumber)
      ? entry.moveNumber
      : Math.floor(index / 2) + 1;
    const ply = Number.isFinite(entry?.ply) ? entry.ply : index + 1;
    const san = entry?.san || sanMoves[index] || '';
    const review = entry?.review || entry?.comment || entry?.analysis || '';

    return {
      ply,
      moveNumber,
      color,
      san,
      review
    };
  });
}

function parsePartialMoveReviews(text, sanMoves) {
  if (!text) return null;

  const arrayStart = text.indexOf('[');
  if (arrayStart === -1) return null;

  const slice = text.slice(arrayStart);
  const rawMoves = [];
  let inString = false;
  let escape = false;
  let braceDepth = 0;
  let objStart = -1;

  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (braceDepth === 0) {
        objStart = i;
      }
      braceDepth += 1;
      continue;
    }

    if (ch === '}') {
      if (braceDepth > 0) {
        braceDepth -= 1;
        if (braceDepth === 0 && objStart !== -1) {
          const objText = slice.slice(objStart, i + 1);
          objStart = -1;
          try {
            const parsed = JSON.parse(objText);
            rawMoves.push(parsed);
          } catch {
            // ignore incomplete or invalid objects
          }
        }
      }
      continue;
    }

    if (ch === ']' && braceDepth === 0) {
      break;
    }
  }

  if (rawMoves.length === 0) return null;
  return normalizeMoveReviews(rawMoves, sanMoves);
}

function parseStreamingAnalysis(text, sanMoves) {
  const parsed = extractJson(text);
  if (!parsed) return null;

  if (Array.isArray(parsed?.moves)) {
    return {
      ...parsed,
      moves: normalizeMoveReviews(parsed.moves, sanMoves)
    };
  }

  if (Array.isArray(parsed)) {
    return { format: 'move_review', moves: normalizeMoveReviews(parsed, sanMoves) };
  }

  return null;
}

export default function GameAnalysis({ moveHistory, gameId = null, onClose, variant = 'modal' }) {
  const [analysis, setAnalysis] = useState(null);
  const [analysisDraft, setAnalysisDraft] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInline = variant === 'inline';
  const sanMoves = useMemo(() => toSanHistory(moveHistory), [moveHistory]);

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
    setAnalysisDraft('');
    
    try {
      const result = await analyzeGame(moveHistory, null, gameId, (fullText) => {
        setAnalysisDraft(fullText);
        const partialMoves = parsePartialMoveReviews(fullText, sanMoves);
        if (partialMoves) {
          setAnalysis({ format: 'move_review', moves: partialMoves });
        }
      });

      if (!result) {
        setAnalysis('Error: Failed to get analysis. Please try again.');
        return;
      }

      if (typeof result === 'string') {
        const parsed = parseStreamingAnalysis(result, sanMoves);
        if (parsed) {
          setAnalysis(parsed);
          setAnalysisDraft('');
        } else {
          setAnalysis(result);
        }
        return;
      }

      setAnalysis(result);
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

  const displayedAnalysis = analysis ?? (analysisDraft ? analysisDraft : null);

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
      {isAnalyzing && !displayedAnalysis && (
        <div className="analysis-loading">
          <div className="spinner"></div>
          <p>AI is analyzing your game...</p>
        </div>
      )}
      {displayedAnalysis && (
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
            <div className="analysis-text">{displayedAnalysis}</div>
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
