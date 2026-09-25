import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import DailyPuzzleStreak from "../components/DailyPuzzleStreak";
import { generatePuzzleForThemesAsync } from "../engine/puzzles/puzzleWorkerClient";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import AccountRequired from "../components/AccountRequired";
import { LESSON_CATALOG } from "../engine/lessons/lessonCatalog";
import { explainCoachMove, summarizeLessonConcept } from "../engine/coach/coachAI";
import {
  Puzzle,
  Check,
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

const PUZZLE_RATING_START = 400;
const PUZZLE_RATING_MIN = 400;
const PUZZLE_RATING_MAX = 1800;

function difficultyForRating(rating) {
  if (rating < 700) return "beginner";
  if (rating < 1000) return "easy";
  if (rating < 1350) return "intermediate";
  return "advanced";
}

function difficultyLabel(difficulty) {
  return difficulty === "beginner" ? "Beginner" : difficulty === "easy" ? "Easy" : difficulty === "intermediate" ? "Intermediate" : "Advanced";
}

function difficultyProgress(rating) {
  return Math.max(4, Math.min(100, Math.round(((rating - PUZZLE_RATING_MIN) / (PUZZLE_RATING_MAX - PUZZLE_RATING_MIN)) * 100)));
}

// Lesson concepts live in a small sidebar card that users skim, so both the
// AI summary and the local fallback are capped at 1-2 short sentences.
const SHORT_CONCEPT_MAX_WORDS = 22;

/**
 * Splits text into sentences. A period only counts as a sentence boundary
 * when it does not belong to a single-letter abbreviation ("e.g.", "i.e.")
 * or a numbered chess move ("1. e4"); such fragments are merged back into
 * the sentence they belong to.
 *
 * @param {string} text Normalized single-spaced text.
 * @returns {string[]} Sentence fragments, abbreviations kept intact.
 */
function splitSentencesForConcept(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  const sentences = [];
  for (const part of parts) {
    const prev = sentences[sentences.length - 1];
    if (prev && /(?:\b[a-z]\.|\b\d+\.)$/i.test(prev.trim())) {
      sentences[sentences.length - 1] = `${prev} ${part}`;
    } else {
      sentences.push(part);
    }
  }
  return sentences;
}

/**
 * Caps the lesson concept shown in the sidebar card at 1-2 short sentences so
 * users can skim it, regardless of what the AI or fallback produced.
 *
 * @param {string | string[]} text AI summary or lesson description.
 * @param {number} [maxWords] Total word cap across kept sentences.
 * @returns {string} The trimmed concept, at most `maxWords` words long.
 */
function trimToShortConcept(text, maxWords = SHORT_CONCEPT_MAX_WORDS) {
  const joined = Array.isArray(text) ? text.join(" ") : String(text || "");
  const cleaned = joined.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  let kept = "";
  for (const sentence of splitSentencesForConcept(cleaned).slice(0, 2)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const next = kept ? `${kept} ${trimmed}` : trimmed;
    if (next.split(" ").filter(Boolean).length > maxWords) break;
    kept = next;
  }
  if (kept) return kept;

  // A single runaway sentence: hard-trim at the word cap.
  const words = cleaned.split(" ").filter(Boolean);
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}\u2026`;
}

export default function Puzzles() {
  const { isLoggedIn } = useUser();
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
  const [wrongMove, setWrongMove] = useState(false);
  const [wrongMoveMessage, setWrongMoveMessage] = useState("");
  const [showWrongMoveOverlay, setShowWrongMoveOverlay] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);

  // AI explanation state for incorrect puzzle moves
  const [llmDescription, setLlmDescription] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [lessonConceptSummary, setLessonConceptSummary] = useState(null);
  const [lessonConceptLoading, setLessonConceptLoading] = useState(false);

  const generationRequestRef = useRef(0);
  const explanationRequestRef = useRef(0);
  const lessonSummaryRequestRef = useRef(0);
  const timerIds = useRef([]);
  const wrongMoveOverlayTimerRef = useRef(null);
  // Set once this session has progressed past its starting stats, so a slow
  // stats load never overwrites progress the user just made.
  const statsTouchedRef = useRef(false);

  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [puzzleRating, setPuzzleRating] = useState(PUZZLE_RATING_START);

  // Load the user's saved puzzle stats from the database so Solved, Streak,
  // Best, and the rating survive reloads and devices. Guests (or offline
  // sessions) simply keep session-only stats, as before.
  useEffect(() => {
    let cancelled = false;
    api
      .getPuzzleStats()
      .then((data) => {
        if (cancelled) return;
        const saved = data?.stats;
        if (!saved || statsTouchedRef.current) return;
        setSolvedCount(Number(saved.solvedCount) || 0);
        setAttemptedCount(Number(saved.attemptedCount) || 0);
        setStreak(Number(saved.currentStreak) || 0);
        setBestStreak(Number(saved.bestStreak) || 0);
        const savedRating = Number(saved.rating);
        if (Number.isFinite(savedRating) && savedRating > 0) {
          setPuzzleRating(
            Math.max(PUZZLE_RATING_MIN, Math.min(PUZZLE_RATING_MAX, savedRating)),
          );
        }
      })
      .catch(() => {
        // Stats stay session-only when the backend is unreachable.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistPuzzleStats(stats) {
    api
      .savePuzzleStats(stats)
      .catch((error) => {
        console.warn(
          "[Puzzles] Failed to save puzzle stats:",
          error?.message || error,
        );
      });
  }

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

  function hideWrongMoveOverlay() {
    if (wrongMoveOverlayTimerRef.current) {
      window.clearTimeout(wrongMoveOverlayTimerRef.current);
      wrongMoveOverlayTimerRef.current = null;
    }
    setShowWrongMoveOverlay(false);
  }

  function showWrongMoveFeedback() {
    hideWrongMoveOverlay();
    setShowWrongMoveOverlay(true);
    wrongMoveOverlayTimerRef.current = window.setTimeout(() => {
      setShowWrongMoveOverlay(false);
      wrongMoveOverlayTimerRef.current = null;
    }, 1500);
  }

  async function loadPuzzleForLesson(lessonIndex, seed = randomPuzzleSeed()) {
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setInitializing(true);
    setGenerationError(null);
    explanationRequestRef.current += 1;
    setLlmDescription(null);
    setLlmLoading(false);
    setLlmError(null);
    setWrongMove(false);
    setWrongMoveMessage("");
    hideWrongMoveOverlay();
    setSelectedSquare(null);

    const lesson = LESSON_CATALOG[lessonIndex] || LESSON_CATALOG[0];

    try {
      const difficulty = difficultyForRating(puzzleRating);
      const freshPuzzle = await generatePuzzleForThemesAsync(
        lesson.puzzleThemes || [],
        seed,
        { difficulty },
      );

      if (generationRequestRef.current !== requestId) return false;

      setPuzzle({
        ...freshPuzzle,
        lessonTitle: lesson.title,
        lessonTopic: lesson.topic,
        lessonOrder: lesson.order,
        difficulty: difficultyForRating(puzzleRating),
      });
      setPosition(freshPuzzle.fen);
      setSolved(false);
      setWrongMove(false);
    setWrongMoveMessage("");
    hideWrongMoveOverlay();
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

  useEffect(() => {
    const requestId = ++lessonSummaryRequestRef.current;
    setLessonConceptLoading(true);
    setLessonConceptSummary(null);

    summarizeLessonConcept(currentLesson.title, currentLesson.topic, currentLesson.description)
      .then((summary) => {
        if (requestId === lessonSummaryRequestRef.current && summary) {
          setLessonConceptSummary(summary);
        }
      })
      .catch(() => {
        // The short local fallback keeps the card useful when AI is unavailable.
      })
      .finally(() => {
        if (requestId === lessonSummaryRequestRef.current) {
          setLessonConceptLoading(false);
        }
      });
  }, [currentLesson.id, currentLesson.title, currentLesson.topic, currentLesson.description]);

  // Sync puzzle loading when currentLessonIndex changes
  useEffect(() => {
    loadPuzzleForLesson(currentLessonIndex);
    return () => {
      generationRequestRef.current += 1;
      clearTimers();
      if (wrongMoveOverlayTimerRef.current) {
        window.clearTimeout(wrongMoveOverlayTimerRef.current);
        wrongMoveOverlayTimerRef.current = null;
      }
    };
  }, [currentLessonIndex]);

  function clearCoachExplanation() {
    explanationRequestRef.current += 1;
    setLlmDescription(null);
    setLlmLoading(false);
    setLlmError(null);
  }

  function explainWrongMove(fenBefore, move, fenAfter) {
    const requestId = ++explanationRequestRef.current;
    setLlmLoading(true);
    setLlmError(null);
    setLlmDescription(null);

    explainCoachMove(fenBefore, move, fenAfter, null, { puzzleMistake: true })
      .then((explanation) => {
        if (requestId !== explanationRequestRef.current) return;
        if (explanation) {
          setLlmDescription(explanation);
        } else {
          setLlmError("No explanation returned from AI coach.");
        }
      })
      .catch((error) => {
        if (requestId !== explanationRequestRef.current) return;
        setLlmError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (requestId === explanationRequestRef.current) setLlmLoading(false);
      });
  }

  useEffect(() => {
    if (!puzzle) return;
    setPosition(puzzle.fen);
    setWillPlayFollowup(false);
    setSolved(false);
    setWrongMove(false);
    setWrongMoveMessage("");
    hideWrongMoveOverlay();
    clearCoachExplanation();
    setShowHint(false);
    setSelectedSquare(null);
  }, [puzzle?.id, puzzle?.fen]);

  async function goToNextPuzzle(wasSolved) {
    if (initializing) return;

    const nextAttempted = attemptedCount + 1;
    const nextSolved = wasSolved ? solvedCount + 1 : solvedCount;
    const nextStreak = wasSolved ? streak + 1 : 0;
    const nextBestStreak = wasSolved
      ? Math.max(bestStreak, nextStreak)
      : bestStreak;
    const nextRating = wasSolved
      ? Math.min(PUZZLE_RATING_MAX, puzzleRating + 80)
      : Math.max(PUZZLE_RATING_MIN, puzzleRating - 40);

    statsTouchedRef.current = true;
    setAttemptedCount(nextAttempted);
    setSolvedCount(nextSolved);
    setStreak(nextStreak);
    setBestStreak(nextBestStreak);
    setPuzzleRating(nextRating);
    persistPuzzleStats({
      solvedCount: nextSolved,
      attemptedCount: nextAttempted,
      streak: nextStreak,
      bestStreak: nextBestStreak,
      rating: nextRating,
    });

    const nextIndex = (currentLessonIndex + 1) % LESSON_CATALOG.length;
    setCurrentLessonIndex(nextIndex);
  }

  function goToNextLesson() {
    if (initializing) return;
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

    if (!move) {
      setWrongMove(true);
      setWrongMoveMessage("That move is not legal in this position. Try another move.");
      showWrongMoveFeedback();
      setSolved(false);
      clearCoachExplanation();
      setShowHint(false);
      setSelectedSquare(null);
      return false;
    }

    const isSolution =
      move.san === puzzle.solution ||
      moveSquaresMatch(`${sourceSquare}${targetSquare}`, puzzle.solution);

    if (!isSolution) {
      setWrongMove(true);
      setWrongMoveMessage("That move missed the tactic. Try again.");
      showWrongMoveFeedback();
      setSolved(false);
      explainWrongMove(position, move.san, chess.fen());
      return false;
    }

    setPosition(chess.fen());
    setSolved(true);
    setWrongMove(false);
    setWrongMoveMessage("");
    hideWrongMoveOverlay();
    clearCoachExplanation();
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
    setWrongMove(false);
    setWrongMoveMessage("");
    hideWrongMoveOverlay();
    clearCoachExplanation();
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
    solved ? lastMoveSquares(game) : selectedSquareStyles();

  return (
    <div className="puzzles-page">
      <div className="puzzles-container">
        {/* 🤖 AI feedback after an incorrect move */}
        {(wrongMove || llmLoading || llmError) && (
          <div className="puzzles-llm-top-section">
            {llmLoading && (
              <div className="puzzles-llm-card puzzles-llm-card--loading" role="status">
                <div className="puzzles-llm-header">
                  <Bot className="puzzles-llm-icon" size={18} />
                  <span>AI Coach Explanation</span>
                </div>
                <p className="puzzles-llm-text">
                  <span className="puzzles-llm-spinner" /> Analyzing why that move missed...
                </p>
              </div>
            )}

            {llmError && (
              <div className="puzzles-llm-card puzzles-llm-card--error" role="alert">
                <div className="puzzles-llm-header">
                  <AlertTriangle className="puzzles-llm-icon" size={18} />
                  <span>AI Coach Explanation Error</span>
                </div>
                <p className="puzzles-llm-error-text">{llmError}</p>
              </div>
            )}

            {llmDescription && !llmLoading && (
              <div className="puzzles-llm-card">
                <div className="puzzles-llm-header">
                  <Bot className="puzzles-llm-icon" size={18} />
                  <span>Why that move missed</span>
                </div>
                <p className="puzzles-llm-text">{llmDescription}</p>
              </div>
            )}

            {wrongMove && (
              <button
                type="button"
                className="puzzle-action puzzle-action--retry puzzles-llm-retry"
                onClick={handleReset}
                disabled={initializing || !puzzle || llmLoading}
              >
                <RotateCcw size={16} /> Retry
              </button>
            )}
          </div>
        )}

        {/* ── Daily Puzzle Streak ─────────────────────────── */}
        <section className="daily-streak-section">
          <DailyPuzzleStreak />
        </section>

        {/* ── Lesson Scheme Header ─────────────────────────── */}
        <header className="puzzles-header">
          <div className="puzzles-header-top">
            <div className="puzzles-eyebrow">
              <GraduationCap className="puzzles-eyebrow-icon" size={13} />
              <span>
                Lesson Scheme · {currentLesson.order} of {LESSON_CATALOG.length}
              </span>
            </div>
            <span className="puzzles-meta">
              Topic: {currentLesson.topic} · {difficultyLabel(puzzle?.difficulty || difficultyForRating(puzzleRating))}
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
              onClick={goToNextLesson}
              title="Next lesson puzzle"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>

          <h1 className="puzzles-title">{currentLesson.title}</h1>
          <p className="puzzles-subtitle">
            {displaySide === "white" ? "White" : "Black"} to move. Start with a clear tactic; the challenge grows as you solve.
          </p>
          <div className="puzzle-progression" aria-label={`Puzzle progression: ${difficultyLabel(difficultyForRating(puzzleRating))}, rating ${puzzleRating}`}>
            <div className="puzzle-progression-top"><span>{difficultyLabel(difficultyForRating(puzzleRating))}</span><strong>{puzzleRating}</strong></div>
            <div className="puzzle-progression-track"><span style={{ width: `${difficultyProgress(puzzleRating)}%` }} /></div>
            <div className="puzzle-progression-caption">Solve to move up · miss or skip to ease back</div>
          </div>
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
            {showWrongMoveOverlay && (
              <div className="puzzle-result puzzle-result--wrong" role="status">
                <AlertTriangle size={18} /> {wrongMoveMessage}
              </div>
            )}
          </div>

          <aside className="puzzles-side">
            {isLoggedIn ? (
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
            ) : (
              <AccountRequired
                title="Track your progress"
                message="Solved count, streak, and rating are saved to your account. Log in to keep them."
              />
            )}

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
              <p className="puzzle-lesson-para">
                {lessonConceptLoading ? (
                  <>
                    <span className="puzzles-llm-spinner" /> Condensing this lesson...
                  </>
                ) : (
                  trimToShortConcept(lessonConceptSummary || currentLesson.description)
                )}
              </p>
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
