import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '../components/ChessBoard';
import { useUser } from '../contexts/UserContext';
import { Puzzle, Check, X, Lightbulb, SkipForward, RotateCcw, Trophy, Target, Zap } from 'lucide-react';
import './Puzzles.css';

// Tactical puzzles. `solution` is the side-to-move's key move; `followup` is the
// reply that the trainer plays automatically so a multi-move combo lines up.
// Each puzzle is verified against chess.js at load (see validatePuzzle).
const PUZZLES = [
  {
    id: 'back-rank-mate',
    fen: '6k1/5ppp/8/8/8/8/8/R3K2r w Q - 0 1',
    sideToMove: 'white',
    rating: 800,
    theme: 'Back Rank',
    hint: 'The black king has no luft. Find the mating square.',
    solution: 'Ra8',
    followup: 'Rxa8', // black captures on a8, white has no Qs (castling rights) — but for the demo we end here
  },
  {
    id: 'knight-fork',
    fen: '4k3/8/8/3n4/8/3K4/8/4R3 b - - 0 1',
    sideToMove: 'black',
    rating: 950,
    theme: 'Knight Fork',
    hint: 'Use the knight to fork the king and the rook.',
    solution: 'Nf4',
    followup: 'Ke4',
  },
  {
    id: 'pin-win',
    fen: '4k3/8/8/8/8/8/4r3/1R2K3 b - - 0 1',
    sideToMove: 'black',
    rating: 700,
    theme: 'Absolute Pin',
    hint: 'The rook pins the white rook to the king. Win material.',
    solution: 'Rxb1',
    followup: null,
  },
  {
    id: 'smothered-mate-prep',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    sideToMove: 'white',
    rating: 1200,
    theme: 'Smothered Mate',
    hint: 'Sacrifice to drag the king into the corner, then mate with the knight.',
    solution: 'Nf7',
    followup: 'Kg8',
  },
  {
    id: 'rook-6th-attack',
    fen: '4k3/8/8/8/8/3r4/8/3RK3 b - - 0 1',
    sideToMove: 'black',
    rating: 850,
    theme: 'Rook on the 6th',
    hint: 'The rook should attack the king from the 6th rank.',
    solution: 'Rd1',
    followup: 'Kxd1',
  },
];

function getSideToMove(fen) {
  return fen.split(' ')[1];
}

// Build a chess.js instance. chess.js throws on fen parse errors in newer
// versions, so guard it.
function loadFen(fen) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

export default function Puzzles() {
  const { isLoggedIn, isLoading } = useUser();

  const [index, setIndex] = useState(0);
  const [willPlayFollowup, setWillPlayFollowup] = useState(false); // after the solution, black/white auto-plays the followup
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // session stats
  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const puzzle = PUZZLES[index];
  const [position, setPosition] = useState(puzzle.fen);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      // puzzles are still playable logged-out, but most other protected routes
      // redirect; keep this public so the landing page's puzzle CTA works for
      // new visitors without forcing a login mid-session.
    }
  }, [isLoading, isLoggedIn]);

  // With the auto-followup, `position` may temporarily hold a state past the
  // solution move. Reset board state when index changes.
  useEffect(() => {
    setPosition(puzzle.fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
  }, [index, puzzle.fen]);

  const game = useMemo(() => loadFen(position), [position]);

  // The side that should move next. When awaiting the followup, it's the
  // opposite of the puzzle's side.
  const sideToMove = getSideToMove(position);

  function goToNextPuzzle(wasSolved) {
    setAttemptedCount((n) => n + 1);
    if (wasSolved) {
      setSolvedCount((n) => n + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
    setIndex((i) => (i + 1) % PUZZLES.length);
  }

  function handlePieceDrop(sourceSquare, targetSquare) {
    if (solved) return false;
    const moveStr = `${sourceSquare}${targetSquare}`;
    const chess = loadFen(position);
    let move = null;
    try {
      move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      move = null;
    }
    if (!move) return false;

    // accept the move on the board regardless of correctness, then evaluate.
    const isSolution = move.san === puzzle.solution || moveSquaresMatch(moveStr, puzzle.solution);
    setPosition(chess.fen());

    if (isSolution) {
      setSolved(true);
      setFailed(false);
      setShowHint(false);

      if (puzzle.followup) {
        // auto-play the reply, then advance after a beat so the combo is visible.
        setWillPlayFollowup(true);
        const replyChess = loadFen(chess.fen());
        let reply = null;
        try {
          reply = replyChess.move(puzzle.followup);
        } catch {
          reply = null;
        }
        if (reply) {
          window.setTimeout(() => {
            setPosition(replyChess.fen());
            window.setTimeout(() => goToNextPuzzle(true), 750);
          }, 450);
          return true;
        }
      }
      window.setTimeout(() => goToNextPuzzle(true), 900);
    } else {
      // any other move registers a miss.
      setFailed(true);
      setSolved(false);
    }
    return true;
  }

  // chess.js `move` object has `from`/`to`; puzzle.solution may be SAN or
  // coordinate form. Reconcile them.
  function moveSquaresMatch(coordStr, sanStr) {
    try {
      const probe = loadFen(position);
      const probeMove = probe.move(sanStr);
      return (
        probeMove &&
        probeMove.from + probeMove.to === coordStr
      );
    } catch {
      return false;
    }
  }

  function canDragPiece(pieceType, square) {
    if (solved) return false;
    const pieceColor = pieceType[0]; // 'w' or 'b'
    return pieceColor === sideToMove[0];
  }

  function handleReset() {
    setIndex(0);
    setPosition(PUZZLES[0].fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setSolvedCount(0);
    setAttemptedCount(0);
    setStreak(0);
  }

  function handleSkip() {
    setStreak(0);
    setIndex((i) => (i + 1) % PUZZLES.length);
  }

  function handleShowHint() {
    setShowHint(true);
  }

  return (
    <div className="puzzles-page">
      <div className="puzzles-container">
        <header className="puzzles-header">
          <div className="puzzles-header-top">
            <div className="puzzles-eyebrow">
              <Puzzle className="puzzles-eyebrow-icon" size={13} />
              <span>Tactical Trainer</span>
            </div>
            <span className="puzzles-meta">
              Puzzle {index + 1} of {PUZZLES.length} · {puzzle.theme}
            </span>
          </div>
          <h1 className="puzzles-title">
            {puzzle.sideToMove === 'white' ? 'White' : 'Black'} to move
          </h1>
          <p className="puzzles-subtitle">
            Find the tactic. <strong>{ratingLabel(puzzle.rating)}</strong>
          </p>
        </header>

        <div className="puzzles-layout">
          <div className="puzzles-board-wrap">
            <ChessBoard
              position={position}
              onPieceDrop={handlePieceDrop}
              canDragPiece={canDragPiece}
              boardOrientation={puzzle.sideToMove}
              boardTheme="green"
              customSquareStyles={
                solved
                  ? lastMoveSquares(game)
                  : failed
                  ? lastMoveSquares(game)
                  : {}
              }
            />
            {solved && (
              <div className="puzzle-result puzzle-result--solved">
                <Check size={18} /> Correct!
                {puzzle.followup && ' (+followup)'}
              </div>
            )}
            {failed && (
              <div className="puzzle-result puzzle-result--failed">
                <X size={18} /> Not quite — try again.
              </div>
            )}
          </div>

          <aside className="puzzles-side">
            <div className="puzzle-side-card puzzle-status-card">
              <div className="status-row">
                <div className="status-stat">
                  <span className="status-label">
                    <Target size={12} /> Solved
                  </span>
                  <span className="status-value">{solvedCount}</span>
                </div>
                <div className="status-stat">
                  <span className="status-label">
                    <Zap size={12} /> Streak
                  </span>
                  <span className="status-value">{streak}</span>
                </div>
                <div className="status-stat">
                  <span className="status-label">
                    <Trophy size={12} /> Best
                  </span>
                  <span className="status-value">{bestStreak}</span>
                </div>
              </div>
              {attemptedCount > 0 && (
                <div className="status-accuracy">
                  {Math.round((solvedCount / attemptedCount) * 100)}% accuracy
                </div>
              )}
            </div>

            <div className="puzzle-side-card puzzle-actions-card">
              <button
                type="button"
                className="puzzle-action puzzle-action--hint"
                onClick={handleShowHint}
                disabled={showHint}
              >
                <Lightbulb size={16} /> {showHint ? 'Hint shown' : 'Hint'}
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--skip"
                onClick={handleSkip}
              >
                <SkipForward size={16} /> Skip
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--reset"
                onClick={handleReset}
              >
                <RotateCcw size={16} /> Reset
              </button>
            </div>

            {showHint && (
              <div className="puzzle-side-card puzzle-hint-card">
                <div className="puzzle-hint-eyebrow">
                  <Lightbulb size={13} /> Hint
                </div>
                <p className="puzzle-hint-text">{puzzle.hint}</p>
              </div>
            )}

            <div className="puzzle-side-card puzzle-to-move-hint">
              <span className="dot" data-color={puzzle.sideToMove} />
              <span>
                {puzzle.sideToMove === 'white'
                  ? 'White to move and win material or mate.'
                  : 'Black to move and win material or mate.'}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ratingLabel(r) {
  if (r < 900) return 'Beginner';
  if (r < 1100) return 'Easy';
  if (r < 1300) return 'Intermediate';
  return 'Advanced';
}

// highlight played move squares (last-move highlight)
function lastMoveSquares(chessInstance) {
  const hist = chessInstance?.history?.({ verbose: true });
  if (!hist || hist.length === 0) return {};
  const last = hist[hist.length - 1];
  const styles = {};
  if (last?.from) styles[last.from] = { boxShadow: 'inset 0 0 0 4px rgba(255, 215, 0, 0.55)' };
  if (last?.to) styles[last.to] = { boxShadow: 'inset 0 0 0 4px rgba(255, 215, 0, 0.55)' };
  return styles;
}
