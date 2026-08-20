import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import DailyPuzzleStreak from "../components/DailyPuzzleStreak";
import { generatePuzzleForThemes } from "../engine/puzzles/puzzleGenerator";
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
import "./Puzzles.css";

function loadFen(fen) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

function randomPuzzleSeed() {
  return Date.now() ^ Math.floor(Math.random() * 0xffffffff);
}

function getLessonPracticeContext(search) {
  const params = new URLSearchParams(search);
  const themes = (params.get("themes") || "")
    .split(",")
    .map((theme) => theme.trim())
    .filter(Boolean);
  const seedParam = params.get("seed");
  const requestedSeed = seedParam === null ? Number.NaN : Number(seedParam);

  return {
    lessonId: params.get("lesson") || null,
    lessonTitle: params.get("title") || null,
    themes,
    seed: Number.isFinite(requestedSeed) ? requestedSeed : randomPuzzleSeed(),
  };
}

async function fetchStockfishPuzzle() {
  const response = await fetch("/api/puzzles/stockfish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: "medium", type: "mate-in-1" }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Stockfish could not prepare a puzzle.",
    );
  }

  const puzzle = payload?.puzzle;
  if (!puzzle?.fen || !puzzle?.solution || !puzzle?.sideToMove) {
    throw new Error("Stockfish returned an incomplete puzzle.");
  }

  return puzzle;
}

export default function Puzzles() {
  const location = useLocation();
  const lessonPractice = useMemo(
    () => getLessonPracticeContext(location.search),
    [location.search],
  );
  const isLessonPractice = lessonPractice.themes.length > 0;
  const [puzzleNumber, setPuzzleNumber] = useState(1);
  const [puzzle, setPuzzle] = useState(null);
  const [position, setPosition] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [generationError, setGenerationError] = useState(null);
  const [willPlayFollowup, setWillPlayFollowup] = useState(false);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const generationRequestRef = useRef(0);
  const timerIds = useRef([]);

  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const game = useMemo(() => loadFen(position), [position]);
  const sideToMove = game.turn();
  const displaySide = puzzle?.sideToMove || "white";

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

  async function loadPuzzle({
    incrementNumber = false,
    seed = randomPuzzleSeed(),
  } = {}) {
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setInitializing(true);
    setGenerationError(null);
    setSelectedSquare(null);

    try {
      const freshPuzzle = isLessonPractice
        ? generatePuzzleForThemes(lessonPractice.themes, seed)
        : await fetchStockfishPuzzle();
      if (generationRequestRef.current !== requestId) return false;

      setPuzzle(freshPuzzle);
      setPosition(freshPuzzle.fen);
      setSolved(false);
      setFailed(false);
      setShowHint(false);
      setWillPlayFollowup(false);
      if (incrementNumber) setPuzzleNumber((number) => number + 1);
      return true;
    } catch (error) {
      if (generationRequestRef.current === requestId) {
        setGenerationError(
          error instanceof Error
            ? error.message
            : "Stockfish could not prepare a puzzle.",
        );
      }
      return false;
    } finally {
      if (generationRequestRef.current === requestId) {
        setInitializing(false);
      }
    }
  }

  useEffect(() => {
    setPuzzleNumber(1);
    loadPuzzle({ seed: lessonPractice.seed });
    return () => {
      generationRequestRef.current += 1;
      clearTimers();
    };
  }, [location.search]);

  useEffect(() => {
    if (!puzzle) return;
    setPosition(puzzle.fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setSelectedSquare(null);
  }, [puzzle?.id, puzzle?.fen]);

  async function goToNextPuzzle(wasSolved) {
    if (initializing) return;

    setAttemptedCount((count) => count + 1);
    if (wasSolved) {
      setSolvedCount((count) => count + 1);
      setStreak((currentStreak) => {
        const nextStreak = currentStreak + 1;
        setBestStreak((currentBest) => Math.max(currentBest, nextStreak));
        return nextStreak;
      });
    } else {
      setStreak(0);
    }

    await loadPuzzle({ incrementNumber: true });
  }

  function moveSquaresMatch(coordinateMove, solution) {
    if (!solution || !position) return false;
    try {
      const probe = loadFen(position);
      const probeMove = probe.move(solution);
      return probeMove && `${probeMove.from}${probeMove.to}` === coordinateMove;
    } catch {
      return false;
    }
  }

  function handlePieceDrop(sourceSquare, targetSquare) {
    if (solved || initializing || !puzzle || !sourceSquare || !targetSquare) {
      return false;
    }

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
      moveSquaresMatch(`${sourceSquare}${targetSquare}`, puzzle.solution);

    if (!isSolution) {
      setFailed(true);
      setSolved(false);
      return false;
    }

    setPosition(chess.fen());
    setSolved(true);
    setFailed(false);
    setShowHint(false);
    setSelectedSquare(null);

    if (puzzle.followup) {
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
    return true;
  }

  function handleSquareClick(square) {
    if (solved || initializing || !puzzle) return;

    const clickedPiece = game.get(square);
    if (!selectedSquare) {
      if (clickedPiece?.color === sideToMove) setSelectedSquare(square);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (clickedPiece?.color === sideToMove) {
      setSelectedSquare(square);
      return;
    }

    handlePieceDrop(selectedSquare, square);
    setSelectedSquare(null);
  }

  function canDragPiece(pieceType) {
    if (solved || initializing || !puzzle || !pieceType) return false;
    const pieceColor = pieceType.charAt(0).toLowerCase();
    return pieceColor === sideToMove;
  }

  function handleReset() {
    if (!puzzle || initializing) return;
    clearTimers();
    setPosition(puzzle.fen);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setWillPlayFollowup(false);
    setSelectedSquare(null);
  }

  function selectedSquareStyles() {
    if (!selectedSquare) return {};
    return {
      [selectedSquare]: {
        boxShadow: "inset 0 0 0 4px rgba(129, 182, 76, 0.78)",
      },
    };
  }

  const boardStyles = solved || failed ? lastMoveSquares(game) : selectedSquareStyles();

  return (
    <div className="puzzles-page">
      <div className="puzzles-container">
        <header className="puzzles-header">
          <div className="puzzles-header-top">
            <div className="puzzles-eyebrow">
              <Puzzle className="puzzles-eyebrow-icon" size={13} />
              <span>{isLessonPractice ? "Lesson Practice" : "Tactical Trainer"}</span>
            </div>
            <DailyPuzzleStreak compact />
            <span className="puzzles-meta">
              Puzzle {puzzleNumber} · {puzzle?.theme || "Stockfish"}
            </span>
          </div>
          <h1 className="puzzles-title">
            {displaySide === "white" ? "White" : "Black"} to move
          </h1>
          <p className="puzzles-subtitle">
            {puzzle ? (
              isLessonPractice ? (
                <>Practicing <strong>{lessonPractice.lessonTitle || puzzle.theme}</strong>: find the tactic.</>
              ) : (
                <>Find the tactic. <strong>{ratingLabel(puzzle.rating)}</strong></>
              )
            ) : isLessonPractice ? (
              "Preparing a lesson-specific tactic."
            ) : (
              "Stockfish is preparing your next tactic."
            )}
          </p>
        </header>

        <div className="puzzles-layout">
          <div className="puzzles-board-wrap">
            {puzzle ? (
              <ChessBoard
                position={position}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                canDragPiece={canDragPiece}
                boardOrientation={puzzle.sideToMove}
                boardTheme="green"
                customSquareStyles={boardStyles}
              />
            ) : (
              <div className="puzzle-board-loading" role="status">
                {generationError ? "Stockfish is unavailable" : "Preparing Stockfish puzzle…"}
              </div>
            )}
            {solved && (
              <div className="puzzle-result puzzle-result--solved">
                <Check size={18} /> Correct!
                {willPlayFollowup && " (+followup)"}
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
                  <span className="status-label"><Target size={12} /> Solved</span>
                  <span className="status-value">{solvedCount}</span>
                </div>
                <div className="status-stat">
                  <span className="status-label"><Zap size={12} /> Streak</span>
                  <span className="status-value">{streak}</span>
                </div>
                <div className="status-stat">
                  <span className="status-label"><Trophy size={12} /> Best</span>
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
                onClick={() => setShowHint(true)}
                disabled={showHint || initializing || !puzzle}
              >
                <Lightbulb size={16} /> {showHint ? "Hint shown" : "Hint"}
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--skip"
                onClick={() => goToNextPuzzle(false)}
                disabled={initializing}
              >
                <SkipForward size={16} /> Skip
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--reset"
                onClick={handleReset}
                disabled={initializing || !puzzle}
              >
                <RotateCcw size={16} /> Reset
              </button>
            </div>

            {generationError && (
              <div className="puzzle-side-card puzzle-engine-error" role="alert">
                <strong>
                  {isLessonPractice
                    ? "Unable to create a lesson-specific puzzle."
                    : "Unable to load a Stockfish puzzle."}
                </strong>
                <span>{generationError}</span>
                <button
                  type="button"
                  className="puzzle-action puzzle-action--retry"
                  onClick={() => loadPuzzle()}
                  disabled={initializing}
                >
                  Try again
                </button>
              </div>
            )}

            {showHint && puzzle && (
              <div className="puzzle-side-card puzzle-hint-card">
                <div className="puzzle-hint-eyebrow">
                  <Lightbulb size={13} /> Hint
                </div>
                <p className="puzzle-hint-text">{puzzle.hint}</p>
              </div>
            )}

            <div className="puzzle-side-card puzzle-to-move-hint">
              <span className="dot" data-color={displaySide} />
              <span>
                {displaySide === "white"
                  ? "White to move. You can drag a piece or tap a piece, then tap its destination."
                  : "Black to move. You can drag a piece or tap a piece, then tap its destination."}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ratingLabel(rating) {
  if (rating < 900) return "Beginner";
  if (rating < 1100) return "Easy";
  if (rating < 1300) return "Intermediate";
  return "Advanced";
}

function lastMoveSquares(chessInstance) {
  const history = chessInstance?.history?.({ verbose: true });
  if (!history || history.length === 0) return {};
  const lastMove = history[history.length - 1];
  const styles = {};
  if (lastMove?.from) {
    styles[lastMove.from] = {
      boxShadow: "inset 0 0 0 4px rgba(255, 215, 0, 0.55)",
    };
  }
  if (lastMove?.to) {
    styles[lastMove.to] = {
      boxShadow: "inset 0 0 0 4px rgba(255, 215, 0, 0.55)",
    };
  }
  return styles;
}
