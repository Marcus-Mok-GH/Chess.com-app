import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { analyzeGamePositions } from '../services/engineReview';
import ChessBoard from '../components/ChessBoard';
import { useUser } from '../contexts/UserContext';
import { analyzeGame, getCoachConnectionUrl } from '../engine/coach/coachAI';
import {
  buildReviewPositions,
  centipawnLossAt,
  classifyMove,
  formatEval,
  MOVE_CLASSES,
  summarizeSide,
  winPercentFromCp,
} from '../engine/review/reviewUtils';
import './GameReview.css';

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function resultText(result, orientation) {
  if (result === 'white') return orientation === 'white' ? 'You won' : 'You lost';
  if (result === 'black') return orientation === 'black' ? 'You won' : 'You lost';
  if (result === 'draw') return 'Draw';
  return result || 'Unknown';
}

export default function GameReview() {
  const { gameCode } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [game, setGame] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [currentPly, setCurrentPly] = useState(0);
  const [evalScores, setEvalScores] = useState(null);
  const [bestMoves, setBestMoves] = useState(null);
  const [engineProgress, setEngineProgress] = useState({ done: 0, total: 0 });
  const [engineError, setEngineError] = useState('');
  const [coachComments, setCoachComments] = useState(null);
  const [coachState, setCoachState] = useState('loading'); // loading | ready | unavailable | connect

  const moveListRef = useRef(null);
  const activeMoveRef = useRef(null);

  // ── Load the game record ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setLoadError('');
    setCurrentPly(0);
    setEvalScores(null);
    setBestMoves(null);
    setEngineError('');
    setCoachComments(null);
    setCoachState('loading');

    api.getGameByCode(gameCode)
      .then((record) => {
        if (cancelled) return;
        if (!record || !Array.isArray(record.move_history)) {
          setLoadError('Game not found.');
          return;
        }
        setGame(record);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this game. It may have been removed.');
      });

    return () => { cancelled = true; };
  }, [gameCode]);

  const positions = useMemo(() => {
    if (!game) return null;
    return buildReviewPositions(game.move_history);
  }, [game]);

  const orientation = useMemo(() => {
    if (!game || !user) return 'white';
    const me = String(user.username || user.name || '').toLowerCase();
    if (game.black_player_name && String(game.black_player_name).toLowerCase() === me) return 'black';
    return 'white';
  }, [game, user]);

  // ── Stockfish analysis (progressive) ─────────────────────────────────────
  useEffect(() => {
    if (!positions || positions.fens.length < 2) return undefined;
    let cancelled = false;
    setEngineProgress({ done: 0, total: positions.fens.length });
    setEngineError('');

    analyzeGamePositions(positions.fens, {
      onProgress: (done, total) => { if (!cancelled) setEngineProgress({ done, total }); },
    })
      .then(({ scores, bestMoves: engineBest }) => {
        if (cancelled) return;
        setEvalScores(scores);
        setBestMoves(engineBest);
      })
      .catch((error) => {
        if (cancelled) return;
        setEngineError(error?.message || 'Stockfish analysis is unavailable right now.');
      });

    return () => { cancelled = true; };
  }, [positions]);

  // ── LLM coach commentary ─────────────────────────────────────────────────
  useEffect(() => {
    if (!game) return undefined;
    let cancelled = false;
    setCoachState('loading');

    analyzeGame(null, game.result, game.game_code)
      .then((analysis) => {
        if (cancelled) return;
        if (analysis && analysis.format === 'move_review' && Array.isArray(analysis.moves)) {
          const byPly = new Map();
          analysis.moves.forEach((entry, index) => {
            const ply = Number.isFinite(entry.ply) ? entry.ply : index + 1;
            if (entry.review) byPly.set(ply, entry.review);
          });
          setCoachComments(byPly);
          setCoachState('ready');
        } else {
          setCoachState('unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) setCoachState('connect');
      });

    return () => { cancelled = true; };
  }, [game]);

  // ── Derived review data ──────────────────────────────────────────────────
  const losses = useMemo(() => {
    if (!positions || !evalScores) return null;
    return positions.sans.map((_, i) => centipawnLossAt(evalScores, i));
  }, [positions, evalScores]);

  const classes = useMemo(() => {
    if (!positions) return null;
    return positions.sans.map((_, i) => {
      if (!losses) return null;
      const isBest = Boolean(bestMoves?.[i]?.bestMove && positions.ucis[i] === bestMoves[i].bestMove);
      return classifyMove(losses[i], isBest);
    });
  }, [positions, losses, bestMoves]);

  const whiteSummary = useMemo(() => {
    if (!losses) return null;
    const plies = positions.sans.map((_, i) => i).filter((i) => i % 2 === 0);
    return summarizeSide(losses, plies);
  }, [losses, positions]);

  const blackSummary = useMemo(() => {
    if (!losses) return null;
    const plies = positions.sans.map((_, i) => i).filter((i) => i % 2 === 1);
    return summarizeSide(losses, plies);
  }, [losses, positions]);

  const whiteEval = useMemo(() => {
    if (!positions || !evalScores) return null;
    const score = evalScores[currentPly];
    if (score == null) return null;
    return currentPly % 2 === 0 ? score : -score;
  }, [positions, evalScores, currentPly]);

  const currentEvalText = useMemo(() => {
    const isGameOverNow = positions && currentPly === positions.fens.length - 1 && game?.result;
    if (isGameOverNow) {
      if (game.result === 'white') return '1-0';
      if (game.result === 'black') return '0-1';
      if (game.result === 'draw') return '½-½';
    }
    return formatEval(whiteEval);
  }, [positions, currentPly, game, whiteEval]);

  const moveRows = useMemo(() => {
    if (!positions) return [];
    const rows = [];
    for (let i = 0; i < positions.sans.length; i += 2) {
      rows.push({
        number: Math.floor(i / 2) + 1,
        white: { ply: i + 1, san: positions.sans[i], cls: classes?.[i] || null },
        black: positions.sans[i + 1]
          ? { ply: i + 2, san: positions.sans[i + 1], cls: classes?.[i + 1] || null }
          : null,
      });
    }
    return rows;
  }, [positions, classes]);

  const currentComment = useMemo(() => {
    if (!coachComments || currentPly === 0) return null;
    return coachComments.get(currentPly) || null;
  }, [coachComments, currentPly]);

  const currentEngineNote = useMemo(() => {
    if (!positions || !bestMoves || currentPly === 0 || currentPly > positions.sans.length) return null;
    const played = positions.ucis[currentPly - 1];
    const best = bestMoves[currentPly - 1];
    if (!best || !best.bestMove) return null;
    if (played === best.bestMove) return { text: 'Engine best move.', isBest: true };
    const evalText = losses && losses[currentPly - 1] != null && losses[currentPly - 1] > 50
      ? `Better was ${best.bestSan || best.bestMove}.`
      : `Engine preferred ${best.bestSan || best.bestMove}.`;
    return { text: evalText, isBest: false };
  }, [positions, bestMoves, currentPly, losses]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const totalPlies = positions ? positions.sans.length : 0;
  const goToPly = useCallback((ply) => {
    setCurrentPly(Math.max(0, Math.min(ply, totalPlies)));
  }, [totalPlies]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCurrentPly((p) => Math.max(0, p - 1)); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setCurrentPly((p) => Math.min(totalPlies, p + 1)); }
      else if (event.key === 'Home') { event.preventDefault(); setCurrentPly(0); }
      else if (event.key === 'End') { event.preventDefault(); setCurrentPly(totalPlies); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [totalPlies]);

  useEffect(() => {
    if (activeMoveRef.current?.scrollIntoView) {
      activeMoveRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [currentPly]);

  const lastMoveSquares = useMemo(() => {
    if (!positions || currentPly === 0) return {};
    const uci = positions.ucis[currentPly - 1];
    if (!uci) return {};
    const styles = {};
    styles[uci.slice(0, 2)] = { boxShadow: 'inset 0 0 0 4px rgba(255, 213, 79, 0.55)' };
    styles[uci.slice(2, 4)] = { boxShadow: 'inset 0 0 0 4px rgba(255, 213, 79, 0.75)' };
    return styles;
  }, [positions, currentPly]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="game-review-page">
        <div className="game-review-container">
          <button type="button" className="review-back-link" onClick={() => navigate('/history')}>
            ← Back to Game History
          </button>
          <div className="review-error">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!game || !positions) {
    return (
      <div className="game-review-page">
        <div className="game-review-container">
          <h1 className="review-heading">Game Review</h1>
          <div className="review-loading"><div className="spinner" /> Loading game…</div>
        </div>
      </div>
    );
  }

  const winPercent = whiteEval == null ? 50 : winPercentFromCp(whiteEval);
  const engineDone = evalScores != null || positions.fens.length < 2;
  const engineActive = !engineDone && !engineError;
  const showFinalPosition = game.result && currentPly === positions.fens.length - 1;

  const accuracyCard = (summary, label, side) => (
    <div className={`review-accuracy-card ${side === 'black' ? 'review-accuracy-black' : ''}`}>
      <span className="review-accuracy-label">{label}</span>
      <span className="review-accuracy-value">
        {summary && summary.accuracy != null ? `${summary.accuracy.toFixed(1)}%` : '—'}
      </span>
      {summary && summary.counts ? (
        <span className="review-accuracy-counts">
          {Object.entries(summary.counts)
            .filter(([, count]) => count > 0)
            .map(([key, count]) => (
              <span key={key} className="review-count-pill" style={{ background: MOVE_CLASSES[key].color }}>
                {count} {MOVE_CLASSES[key].label.toLowerCase()}
              </span>
            ))}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="game-review-page">
      <div className="game-review-container">
        <button type="button" className="review-back-link" onClick={() => navigate('/history')}>
          ← Back to Game History
        </button>

        <div className="review-header">
          <div>
            <h1 className="review-heading">Game Review</h1>
            <p className="review-subtitle">
              {game.white_player_name || 'White'} vs {game.black_player_name || 'Black'} · {resultText(game.result, orientation)}
            </p>
          </div>
          <div className="review-meta">
            <span className="review-chip">{game.game_mode || 'friendly'}</span>
            <span className="review-chip">{game.game_code}</span>
            <span className="review-chip">{formatDate(game.created_at)}</span>
          </div>
        </div>

        {engineError && <div className="review-banner review-banner-error">Stockfish analysis is unavailable: {engineError}</div>}
        {engineActive && (
          <div className="review-banner review-banner-progress">
            <div className="review-progress-track">
              <div
                className="review-progress-fill"
                style={{ width: `${engineProgress.total ? Math.round((engineProgress.done / engineProgress.total) * 100) : 0}%` }}
              />
            </div>
            Analyzing with Stockfish… {engineProgress.done}/{engineProgress.total} positions
          </div>
        )}

        <div className="review-layout">
          <div className="review-board-column">
            <div className="review-board-wrap">
              <div className={`review-eval-bar ${orientation === 'black' ? 'review-eval-bar-flipped' : ''}`}>
                <div className="review-eval-white" style={{ height: `${showFinalPosition && game.result !== 'white' ? (game.result === 'draw' ? 50 : 0) : winPercent}%` }} />
                <span className="review-eval-text">{currentEvalText}</span>
              </div>
              <div className="review-board">
                <ChessBoard
                  position={positions.fens[currentPly]}
                  boardOrientation={orientation}
                  canDragPiece={() => false}
                  customSquareStyles={lastMoveSquares}
                />
              </div>
            </div>

            <div className="review-controls">
              <button type="button" className="review-control-btn" onClick={() => goToPly(0)} aria-label="First move" disabled={currentPly === 0}>⏮</button>
              <button type="button" className="review-control-btn" onClick={() => goToPly(currentPly - 1)} aria-label="Previous move" disabled={currentPly === 0}>◀</button>
              <span className="review-ply-indicator">{currentPly === 0 ? 'Start' : `Move ${Math.ceil(currentPly / 2)}${currentPly % 2 === 1 ? '' : '…'}`}</span>
              <button type="button" className="review-control-btn" onClick={() => goToPly(currentPly + 1)} aria-label="Next move" disabled={currentPly >= totalPlies}>▶</button>
              <button type="button" className="review-control-btn" onClick={() => goToPly(totalPlies)} aria-label="Last move" disabled={currentPly >= totalPlies}>⏭</button>
            </div>
          </div>

          <div className="review-panel">
            <div className="review-summary">
              {accuracyCard(whiteSummary, game.white_player_name || 'White', 'white')}
              {accuracyCard(blackSummary, game.black_player_name || 'Black', 'black')}
            </div>

            <div className="review-comment-box">
              <h3 className="review-comment-title">Coach commentary</h3>
              {currentPly === 0 ? (
                <p className="review-comment-hint">Step through the moves to see Stockfish notes and coach comments.</p>
              ) : (
                <>
                  {currentEngineNote && (
                    <p className={`review-engine-note ${currentEngineNote.isBest ? 'review-engine-note-best' : ''}`}>
                      <span className="review-engine-tag">Stockfish</span> {currentEngineNote.text}
                    </p>
                  )}
                  {coachState === 'loading' && <p className="review-comment-hint">Coach is reviewing this game…</p>}
                  {coachState === 'connect' && (
                    <p className="review-comment-hint">
                      The AI coach is not connected. <a href={getCoachConnectionUrl()}>Connect your coach</a> to get move-by-move comments.
                    </p>
                  )}
                  {coachState === 'unavailable' && <p className="review-comment-hint">Coach comments are unavailable right now.</p>}
                  {currentComment && <p className="review-comment-text">{currentComment}</p>}
                </>
              )}
            </div>

            <div className="review-moves" ref={moveListRef}>
              {moveRows.map((row) => (
                <div key={row.number} className="review-move-row">
                  <span className="review-move-number">{row.number}.</span>
                  <button
                    type="button"
                    ref={row.white.ply === currentPly ? activeMoveRef : undefined}
                    className={`review-move ${row.white.ply === currentPly ? 'review-move-active' : ''}`}
                    onClick={() => goToPly(row.white.ply)}
                  >
                    {row.white.san}
                    {row.white.cls && <span className="review-move-dot" style={{ background: MOVE_CLASSES[row.white.cls].color }} title={MOVE_CLASSES[row.white.cls].label} />}
                  </button>
                  {row.black ? (
                    <button
                      type="button"
                      ref={row.black.ply === currentPly ? activeMoveRef : undefined}
                      className={`review-move ${row.black.ply === currentPly ? 'review-move-active' : ''}`}
                      onClick={() => goToPly(row.black.ply)}
                    >
                      {row.black.san}
                      {row.black.cls && <span className="review-move-dot" style={{ background: MOVE_CLASSES[row.black.cls].color }} title={MOVE_CLASSES[row.black.cls].label} />}
                    </button>
                  ) : <span className="review-move review-move-empty" />}
                </div>
              ))}
              {moveRows.length === 0 && <p className="review-comment-hint">This game has no recorded moves.</p>}
            </div>

            {classes && engineDone && (
              <div className="review-legend">
                {Object.entries(MOVE_CLASSES).map(([key, cls]) => (
                  <span key={key} className="review-legend-item">
                    <span className="review-move-dot" style={{ background: cls.color }} /> {cls.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
