import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import DailyPuzzleStreak from "../components/DailyPuzzleStreak";
import { generatePuzzleForThemes } from "../engine/puzzles/puzzleGenerator";
import { LESSON_CATALOG } from "../engine/lessons/lessonCatalog";
import { explainCoachMove } from "../engine/coach/coachAI";
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
  ChevronLeft,
  ChevronRight,
  Bot,
  GraduationCap,
  AlertTriangle,
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

export default function Puzzles() {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine starting index in the lesson scheme
  const searchParams = new URLSearchParams(location.search);
  const requestedLessonId = searchParams.get("lesson");
  const initialIndex = useMemo(() => {
    if (!requestedLessonId) return 0;
    const found = LESSON_CATALOG.findIndex((l) => l.id === requestedLessonId);
    return found !== -1 ? found : 0;
  }, [requestedLessonId]);

  const [currentLessonIndex, setCurrentLessonIndex] = useState(initialIndex);
  const currentLesson = LESSON_CATALOG[currentLessonIndex] || LESSON_CATALOG[0];

  const [puzzle, setPuzzle] = useState(null);
  const [position, setPosition] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [generationError, setGenerationError] = useState(null);
  const [willPlayFollowup, setWillPlayFollowup] = useState(false);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);

  // LLM Description state
  const [llmDescription, setLlmDescription] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);

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

  async function loadPuzzleForLesson(lessonIndex, seed = randomPuzzleSeed()) {
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setInitializing(true);
    setGenerationError(null);
    setSelectedSquare(null);

    const lesson = LESSON_CATALOG[lessonIndex] || LESSON_CATALOG[0];

    try {
      const freshPuzzle = generatePuzzleForThemes(
        lesson.puzzleThemes || [],
        seed,
      );

      if (generationRequestRef.current !== requestId) return false;

      setPuzzle({
        ...freshPuzzle,
        lessonTitle: lesson.title,
        lessonTopic: lesson.topic,
        lessonOrder: lesson.order,
      });
      setPosition(freshPuzzle.fen);
      setSolved(false);
      setFailed(false);
      setShowHint(false);
      setWillPlayFollowup(false);
      return true;
    } catch (error) {
      if (generationRequestRef.current === requestId) {
        setGenerationError(
          error instanceof Error
            ? error.message
            : "The puzzle generator could not prepare a puzzle for this lesson.",
        );
      }
      return false;
    } finally {
      if (generationRequestRef.current === requestId) {
        setInitializing(false);
      }
    }
  }

  // Sync puzzle loading when currentLessonIndex changes
  useEffect(() => {
    loadPuzzleForLesson(currentLessonIndex);
    return () => {
      generationRequestRef.current += 1;
      clearTimers();
    };
  }, [currentLessonIndex]);

  // Fetch LLM description whenever puzzle position/solution changes
  useEffect(() => {
    if (!puzzle?.fen || !puzzle?.solution) return;
    let cancelled = false;
    setLlmLoading(true);
    setLlmError(null);
    setLlmDescription(null);

    explainCoachMove(puzzle.fen, puzzle.solution, null)
      .then((explanation) => {
        if (cancelled) return;
        if (explanation) {
          setLlmDescription(explanation);
        } else {
          setLlmError("No explanation returned from AI coach.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLlmError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLlmLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [puzzle?.fen, puzzle?.solution]);

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

    const nextIndex = (currentLessonIndex + 1) % LESSON_CATALOG.length;
    setCurrentLessonIndex(nextIndex);
  }

  function goToPrevPuzzle() {
    if (initializing) return;
    const prevIndex =
      (currentLessonIndex - 1 + LESSON_CATALOG.length) % LESSON_CATALOG.length;
    setCurrentLessonIndex(prevIndex);
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
          schedule(() => goToNextPuzzle(true), 1200);
        }, 450);
        return true;
      }
    }

    schedule(() => goToNextPuzzle(true), 1200);
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

  const boardStyles =
    solved || failed ? lastMoveSquares(game) : selectedSquareStyles();

  return (
    <div className="puzzles-page">
      <div className="puzzles-container">
        {/* 🤖 LLM Description Section at the Top */}
        <div className="puzzles-llm-top-section">
          {llmLoading && (
            <div className="puzzles-llm-card puzzles-llm-card--loading" role="status">
              <div className="puzzles-llm-header">
                <Bot className="puzzles-llm-icon" size={18} />
                <span>AI Coach Analysis</span>
              </div>
              <p className="puzzles-llm-text">
                <span className="puzzles-llm-spinner" /> Analyzing position...
              </p>
            </div>
          )}

          {llmError && (
            <div className="puzzles-llm-card puzzles-llm-card--error" role="alert">
              <div className="puzzles-llm-header">
                <AlertTriangle className="puzzles-llm-icon" size={18} />
                <span>AI Coach Analysis Error</span>
              </div>
              <p className="puzzles-llm-error-text">{llmError}</p>
            </div>
          )}

          {llmDescription && !llmLoading && (
            <div className="puzzles-llm-card">
              <div className="puzzles-llm-header">
                <Bot className="puzzles-llm-icon" size={18} />
                <span>AI Coach Position Description</span>
              </div>
              <p className="puzzles-llm-text">{llmDescription}</p>
            </div>
          )}
        </div>

        {/* ── Lesson Scheme Header ─────────────────────────── */}
        <header className="puzzles-header">
          <div className="puzzles-header-top">
            <div className="puzzles-eyebrow">
              <GraduationCap className="puzzles-eyebrow-icon" size={13} />
              <span>
                Lesson Scheme · {currentLesson.order} of {LESSON_CATALOG.length}
              </span>
            </div>
            <DailyPuzzleStreak compact />
            <span className="puzzles-meta">
              Topic: {currentLesson.topic} ({currentLesson.difficulty})
            </span>
          </div>

          <div className="puzzles-scheme-nav">
            <button
              type="button"
              className="puzzles-scheme-btn"
              onClick={goToPrevPuzzle}
              title="Previous lesson puzzle"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <select
              className="puzzles-scheme-select"
              value={currentLessonIndex}
              onChange={(e) => setCurrentLessonIndex(Number(e.target.value))}
              aria-label="Select puzzle in lesson scheme"
            >
              {LESSON_CATALOG.map((lesson, idx) => (
                <option key={lesson.id} value={idx}>
                  {lesson.order}. {lesson.title} ({lesson.topic})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="puzzles-scheme-btn"
              onClick={() => goToNextPuzzle(false)}
              title="Next lesson puzzle"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>

          <h1 className="puzzles-title">{currentLesson.title}</h1>
          <p className="puzzles-subtitle">
            {displaySide === "white" ? "White" : "Black"} to move. Find the
            best tactic for this lesson.
          </p>
        </header>

        {/* ── Main Puzzle Layout ─────────────────────────── */}
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
                {generationError
                  ? "Puzzle generation is unavailable"
                  : "Preparing lesson puzzle…"}
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
                <strong>Unable to create lesson puzzle.</strong>
                <span>{generationError}</span>
                <button
                  type="button"
                  className="puzzle-action puzzle-action--retry"
                  onClick={() => loadPuzzleForLesson(currentLessonIndex)}
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

            <div className="puzzle-side-card puzzle-lesson-summary">
              <div className="puzzle-lesson-summary-header">
                <GraduationCap size={14} /> Lesson Concept
              </div>
              {Array.isArray(currentLesson.description) ? (
                currentLesson.description.map((para, i) => (
                  <p key={i} className="puzzle-lesson-para">
                    {para}
                  </p>
                ))
              ) : (
                <p className="puzzle-lesson-para">{currentLesson.description}</p>
              )}
            </div>

            <div className="puzzle-side-card puzzle-to-move-hint">
              <span className="dot" data-color={displaySide} />
              <span>
                {displaySide === "white"
                  ? "White to move. Drag or tap a piece, then tap destination."
                  : "Black to move. Drag or tap a piece, then tap destination."}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
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
