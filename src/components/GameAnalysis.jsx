import { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import StockfishWorker from '../engine/workers/stockfishWorker.js?worker';
import { toSanHistory } from '../engine/game/moveHistory';
import './GameAnalysis.css';

export default function GameAnalysis({ moveHistory, gameId = null, onClose, variant = 'modal' }) {
  const [review, setReview] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const workerRef = useRef(null);
  const isInline = variant === 'inline';

  const sanMoves = useMemo(() => toSanHistory(moveHistory), [moveHistory]);

  const analyzeFen = (fen, depth = 10) => new Promise((resolve, reject) => {
    const worker = workerRef.current;
    if (!worker) {
      reject(new Error('Engine unavailable'));
      return;
    }

    const handleMessage = (e) => {
      if (e.data.type !== 'analysis') return;
      worker.removeEventListener('message', handleMessage);
      resolve(e.data);
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage({ action: 'analyze', fen, depth });
  });

  const evalToWinProb = (score, mate, sideToMove) => {
    if (typeof mate === 'number') {
      const whiteMate = sideToMove === 'w' ? mate : -mate;
      if (whiteMate > 0) return 1;
      if (whiteMate < 0) return 0;
    }

    let normalizedScore = score;
    if (sideToMove === 'b') {
      normalizedScore = -normalizedScore;
    }

    const clamped = Math.max(-1200, Math.min(1200, normalizedScore));
    return 1 / (1 + Math.exp(-clamped / 400));
  };

  const classifyMove = (loss) => {
    if (loss <= 1) return 'Best';
    if (loss <= 3) return 'Excellent';
    if (loss <= 7) return 'Good';
    if (loss <= 15) return 'Inaccuracy';
    if (loss <= 30) return 'Mistake';
    return 'Blunder';
  };

  const runReview = async () => {
    if (!sanMoves.length) {
      setReviewError('No moves available to review.');
      return;
    }

    setIsReviewing(true);
    setReview(null);
    setReviewError(null);

    try {
      if (!workerRef.current) {
        workerRef.current = new StockfishWorker();
      }

      const game = new Chess();
      const positions = [];
      const sides = [];
      sanMoves.forEach((san) => {
        positions.push(game.fen());
        sides.push(game.turn());
        game.move(san);
      });

      const evals = [];
      for (const fen of positions) {
        // eslint-disable-next-line no-await-in-loop
        const result = await analyzeFen(fen, 10);
        evals.push(result);
      }

      const moveData = sanMoves.map((san, index) => {
        const sideToMove = sides[index] || 'w';
        const bestEval = evals[index];
        const afterEval = evals[index + 1] || evals[index];
        const bestProb = evalToWinProb(bestEval.score, bestEval.mate, sideToMove);
        const afterProb = evalToWinProb(afterEval.score, afterEval.mate, sideToMove === 'w' ? 'b' : 'w');
        const loss = Math.max(0, (bestProb - afterProb) * 100);

        return {
          ply: index + 1,
          moveNumber: Math.floor(index / 2) + 1,
          color: index % 2 === 0 ? 'white' : 'black',
          san,
          loss: Number(loss.toFixed(1)),
          classification: classifyMove(loss),
          bestMove: bestEval.bestMove,
        };
      });

      const accuracy = { white: [], black: [] };
      const counts = {};
      moveData.forEach((move) => {
        const score = Math.max(0, 100 - move.loss * 2);
        accuracy[move.color].push(score);
        counts[move.classification] = (counts[move.classification] || 0) + 1;
      });

      const accuracyScore = {
        white: Math.round(accuracy.white.reduce((a, b) => a + b, 0) / Math.max(1, accuracy.white.length)),
        black: Math.round(accuracy.black.reduce((a, b) => a + b, 0) / Math.max(1, accuracy.black.length))
      };

      const keyMoments = [...moveData]
        .filter((move) => ['Blunder', 'Mistake', 'Inaccuracy'].includes(move.classification))
        .sort((a, b) => b.loss - a.loss)
        .slice(0, 5);

      const graphPoints = evals.map((entry, index) => {
        const side = sides[index] || 'w';
        return evalToWinProb(entry.score, entry.mate, side);
      });

      setReview({
        moveData,
        accuracy: accuracyScore,
        counts,
        keyMoments,
        graphPoints
      });
    } catch (error) {
      console.error('[GameAnalysis] Review error:', error);
      setReviewError('Failed to generate review. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  };

  const content = (
    <div className="analysis-content">
      {!review && !isReviewing && (
        <div className="analysis-start">
          <p>Generate a Chess.com style Game Review</p>
          <button onClick={runReview} className="btn btn-primary">
            🧠 Start Review
          </button>
          {reviewError && <p className="analysis-error">{reviewError}</p>}
        </div>
      )}
      {isReviewing && (
        <div className="analysis-loading">
          <div className="spinner"></div>
          <p>Generating review...</p>
        </div>
      )}
      {review && (
        <div className="analysis-result">
          <section className="review-summary">
            <div className="review-summary-card">
              <span className="review-summary-label">White Accuracy</span>
              <strong>{review.accuracy.white}</strong>
            </div>
            <div className="review-summary-card">
              <span className="review-summary-label">Black Accuracy</span>
              <strong>{review.accuracy.black}</strong>
            </div>
            <div className="review-summary-card">
              <span className="review-summary-label">Mistakes + Blunders</span>
              <strong>{(review.counts.Mistake || 0) + (review.counts.Blunder || 0)}</strong>
            </div>
          </section>

          <section className="review-graph">
            <div className="review-section-title">Game Graph</div>
            <div className="review-graph-wrap">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                <path
                  d={review.graphPoints.map((point, index) => {
                    const x = (index / Math.max(1, review.graphPoints.length - 1)) * 100;
                    const y = 40 - point * 40;
                    return `${index === 0 ? 'M' : 'L'}${x},${y}`;
                  }).join(' ')}
                />
              </svg>
            </div>
          </section>

          <section className="review-key-moments">
            <div className="review-section-title">Key Moments</div>
            {review.keyMoments.length === 0 ? (
              <p className="review-empty">No major mistakes detected.</p>
            ) : (
              <div className="review-moment-list">
                {review.keyMoments.map((moment) => (
                  <div key={`${moment.ply}-${moment.san}`} className={`review-moment ${moment.classification.toLowerCase()}`}>
                    <div className="review-moment-header">
                      <span className="review-moment-label">
                        {moment.moveNumber}{moment.color === 'black' ? '...' : '.'} {moment.san}
                      </span>
                      <span className="review-moment-tag">{moment.classification}</span>
                    </div>
                    <div className="review-moment-body">
                      Lost win chance: {moment.loss}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="review-move-list">
            <div className="review-section-title">Move Review</div>
            <div className="analysis-move-reviews">
              {review.moveData.map((entry) => (
                <div key={entry.ply} className="analysis-move-review">
                  <div className="analysis-move-review-header">
                    <span className={`analysis-move-review-color ${entry.color}`}>
                      {entry.moveNumber}{entry.color === 'black' ? '...' : '.'}
                    </span>
                    <span className="analysis-move-review-san">{entry.san}</span>
                    <span className={`review-classification ${entry.classification.toLowerCase()}`}>{entry.classification}</span>
                  </div>
                  <p className="analysis-move-review-text">Loss: {entry.loss}%</p>
                </div>
              ))}
            </div>
          </section>

          {!isReviewing && (
            <button onClick={runReview} className="btn btn-secondary">
              🔄 Re-run Review
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
