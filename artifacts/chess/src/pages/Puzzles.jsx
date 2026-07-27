import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import {
  Puzzle,
  Check,
  X,
  Lightbulb,
  SkipForward,
  RotateCcw,
  Trophy,
  Target,
  Zap,
} from "lucide-react";
import {
  BASE_PUZZLES,
  generatePuzzle,
} from "../engine/puzzles/puzzleGenerator";
import "./Puzzles.css";

function getSideToMove(fen) {
  return fen.split(" ")[1];
}

function loadFen(fen) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

function fallbackPuzzle() {
  const base = BASE_PUZZLES[0];
  const chess = new Chess(base.fen);
  const matingMoves = chess.moves().filter((move) => {
    chess.move(move);
    const isMate = chess.isCheckmate();
    chess.undo();
    return isMate;
  });
  return {
    ...base,
    id: "fallback-mate-in-one",
    sideToMove: chess.turn() === "w" ? "white" : "black",
    solution: matingMoves[0],
    followup: null,
    generated: false,
  };
}

function generatePuzzleSafely(previousPuzzle) {
  try {
    return generatePuzzle();
  } catch {
    return previousPuzzle ?? fallbackPuzzle();
  }
}

function nextPuzzle(previousPuzzle) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const puzzle = generatePuzzleSafely(previousPuzzle);
    if (puzzle.fen !== previousPuzzle?.fen) return puzzle;
  }
  try {
    return generatePuzzle((Date.now() + 1) >>> 0);
  } catch {
    return previousPuzzle ?? fallbackPuzzle();
  }
}

export default function Puzzles() {
  const [puzzleNumber, setPuzzleNumber] = useState(1);
  const [puzzle, setPuzzle] = useState(() => generatePuzzleSafely(null));
  const [willPlayFollowup, setWillPlayFollowup] = useState(false); // after the solution, black/white auto-plays the followup
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // session stats
  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const timerIds = useRef([]);

  const [position, setPosition] = useState(puzzle.fen);

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId));
    timerIds.current = [];
  }

  function schedule(callback, delay) {
    const timerId = window.setTimeout(() => {
      timerIds.current = timerIds.current.filter((id) => id !== timerId);
      callback();
    }, delay);
    timerIds.current.push(timerId);
  }

  useEffect(() => {
    clearTimers();
    setPosition(puzzle.fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
  }, [puzzle.id, puzzle.fen]);

  useEffect(() => () => clearTimers(), []);

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
    setPuzzle((current) => nextPuzzle(current));
    setPuzzleNumber((number) => number + 1);
  }

  function handlePieceDrop(sourceSquare, targetSquare) {
    if (solved) return false;
    const moveStr = `${sourceSquare}${targetSquare}`;
    const chess = loadFen(position);
    let move = null;
    try {
      move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
    } catch {
      move = null;
    }
    if (!move) return false;

    const isSolution =
      move.san === puzzle.solution ||
      moveSquaresMatch(moveStr, puzzle.solution);
    if (!isSolution) {
      setFailed(true);
      setSolved(false);
      return false;
    }

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
          schedule(() => {
            setPosition(replyChess.fen());
            schedule(() => goToNextPuzzle(true), 750);
          }, 450);
          return true;
        }
      }
      schedule(() => goToNextPuzzle(true), 900);
    }
    return true;
  }

  // chess.js `move` object has `from`/`to`; puzzle.solution may be SAN or
  // coordinate form. Reconcile them.
  function moveSquaresMatch(coordStr, sanStr) {
    try {
      const probe = loadFen(position);
      const probeMove = probe.move(sanStr);
      return probeMove && probeMove.from + probeMove.to === coordStr;
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
    clearTimers();
    const freshPuzzle = nextPuzzle(puzzle);
    setPuzzle(freshPuzzle);
    setPuzzleNumber(1);
    setPosition(freshPuzzle.fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setSolvedCount(0);
    setAttemptedCount(0);
    setStreak(0);
  }

  function handleSkip() {
    clearTimers();
    setStreak(0);
    setPuzzle((current) => nextPuzzle(current));
    setPuzzleNumber((number) => number + 1);
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
              Puzzle {puzzleNumber} · {puzzle.theme}
            </span>
          </div>
          <h1 className="puzzles-title">
            {puzzle.sideToMove === "white" ? "White" : "Black"} to move
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
                {puzzle.followup && " (+followup)"}
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
                <Lightbulb size={16} /> {showHint ? "Hint shown" : "Hint"}
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
                {puzzle.sideToMove === "white"
                  ? "White to move and win material or mate."
                  : "Black to move and win material or mate."}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ratingLabel(r) {
  if (r < 900) return "Beginner";
  if (r < 1100) return "Easy";
  if (r < 1300) return "Intermediate";
  return "Advanced";
}

// highlight played move squares (last-move highlight)
function lastMoveSquares(chessInstance) {
  const hist = chessInstance?.history?.({ verbose: true });
  if (!hist || hist.length === 0) return {};
  const last = hist[hist.length - 1];
  const styles = {};
  if (last?.from)
    styles[last.from] = {
      boxShadow: "inset 0 0 0 4px rgba(255, 215, 0, 0.55)",
    };
  if (last?.to)
    styles[last.to] = { boxShadow: "inset 0 0 0 4px rgba(255, 215, 0, 0.55)" };
  return styles;
}
