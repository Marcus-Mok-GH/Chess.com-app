import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import DailyPuzzleStreak from "../components/DailyPuzzleStreak";
import { generatePuzzleForThemesAsync } from "../engine/puzzles/puzzleWorkerClient";
import {
  buildLessonPuzzle,
  randomPuzzleSeed,
} from "../engine/puzzles/lessonPuzzle";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import AccountRequired from "../components/AccountRequired";
import { LESSON_CATALOG } from "../engine/lessons/lessonCatalog";
import { explainCoachMove, getLessonConcept } from "../engine/coach/coachAI";
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

// ── SSR initial puzzle ─────────────────────────────────────────────────────
// The server renders this page with a REAL puzzle instead of the
// "Preparing lesson puzzle…" placeholder: while server-rendering, the first
// lesson puzzle is generated synchronously and embedded into the HTML as an
// inline payload under this key. The browser adopts that payload on its first
// render so the client paint matches the server-sent board exactly, instead
// of flashing the placeholder and then generating a second, different puzzle.
const INITIAL_PUZZLE_KEY = "__INITIAL_PUZZLE__";

/**
 * Builds a lesson's first puzzle synchronously for the SSR render (there is
 * no window then, so the async worker client is unavailable and a placeholder
 * would otherwise ship to the browser). Delegates to the shared
 * buildLessonPuzzle used by `GET /api/puzzles/lesson` too, so a server-built
 * puzzle has the same shape wherever it comes from.
 */
function buildServerPuzzle(lessonIndex, seed = randomPuzzleSeed()) {
  try {
    const lesson = LESSON_CATALOG[lessonIndex] || LESSON_CATALOG[0];
    return buildLessonPuzzle({
      lesson,
      lessonIndex,
      seed,
      difficulty: difficultyForRating(PUZZLE_RATING_START),
    });
  } catch {
    // Degrade to the previous behaviour (loading placeholder + client-side
    // generation) instead of failing the whole SSR response.
    return null;
  }
}

/**
 * A puzzle is only usable when its FEN parses and its solution is a legal
 * move from that position — otherwise the board would show the start
 * position while the puzzle kept its invalid values.
 */
function isPlayablePuzzle(candidate) {
  if (!candidate || typeof candidate.fen !== "string" || !candidate.solution) {
    return false;
  }
  try {
    const probe = new Chess(candidate.fen);
    return Boolean(probe.move(candidate.solution));
  } catch {
    return false;
  }
}

/**
 * Fetches the puzzle for one lesson. Generation happens on the SERVER (the
 * same shared builder the SSR render uses) so slow devices — or ones without
 * module worker support — never run the generator locally. When that request
 * is unavailable (offline, rate limited, older API), we fall back to the
 * worker/synchronous generator exactly as before.
 */
async function requestLessonPuzzle({ lesson, seed, difficulty }) {
  try {
    const data = await api.generateLessonPuzzle({
      lessonId: lesson.id,
      seed,
      difficulty,
    });
    const candidate = data?.puzzle;
    if (isPlayablePuzzle(candidate)) return candidate;
  } catch {
    // Fall through to local generation.
  }
  return generatePuzzleForThemesAsync(lesson.puzzleThemes || [], seed, {
    difficulty,
  });
}

/**
 * Client half of the handshake: reads the puzzle the server embedded in the
 * HTML for THIS lesson, if any. Stale or malformed payloads are ignored so
 * the page falls back to generating a fresh puzzle exactly as before.
 */
function readEmbeddedPuzzle(lessonIndex) {
  if (typeof window === "undefined") return null;
  try {
    const payload = window[INITIAL_PUZZLE_KEY];
    if (!payload || payload.lessonIndex !== lessonIndex) return null;
    const candidate = payload.puzzle;
    // Only adopt a playable candidate (see isPlayablePuzzle).
    return isPlayablePuzzle(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Serializes the payload for the inline <script> that ships it to the
 * browser. "<" is JSON-escaped so no string value (hint text, lesson titles)
 * can end the script tag early ("</script>") without changing the decoded
 * value once JSON.parse runs.
 */
function serializeInitialPuzzle(payload) {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

// Lesson concepts live in a small sidebar card that users skim, so both the
// AI summary and the local fallback are capped at 1-2 short sentences.
const SHORT_CONCEPT_MAX_WORDS = 22;

const PIECE_VALUES_FALLBACK = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function countMaterial(chess, color) {
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.color === color) total += PIECE_VALUES_FALLBACK[piece.type] ?? 0;
    }
  }
  return total;
}

/**
 * Builds the concept text shown in the sidebar card from the SPECIFIC puzzle
 * the generator produced — not from the lesson's static prose. Reads concrete
 * facts of the position (material balance, check, available captures) plus the
 * generator's position-specific hint, so the guidance matches the board
 * without naming the solution move.
 */
function buildPuzzleConceptFallback(puzzle) {
  if (!puzzle?.fen) return "";
  const side = puzzle.sideToMove === "black" ? "Black" : "White";
  const parts = [`${side} to move.`];

  try {
    const chess = new Chess(puzzle.fen);
    const mover = chess.turn();
    const opponent = mover === "w" ? "b" : "w";

    // Material context: capture tactics usually appear when the mover is down
    // material or an enemy piece can be won.
    if (countMaterial(chess, opponent) > countMaterial(chess, mover)) {
      parts.push(`${side} is down material and needs a tactic to fight back.`);
    }

    // Best available capture value for the side to move.
    let bestCapture = null;
    for (const move of chess.moves({ verbose: true })) {
      const value = PIECE_VALUES_FALLBACK[move.captured] ?? 0;
      if (value > 0 && (!bestCapture || value > bestCapture)) bestCapture = value;
    }
    if (bestCapture !== null && bestCapture >= 3) {
      parts.push("A valuable enemy piece can be captured — check it is not defended first.");
    }

    if (chess.isCheck()) {
      parts.push(`${side} is in check and must deal with the threat first.`);
    }
  } catch {
    // Position could not be parsed; the theme/hint lines below still apply.
  }

  if (parts.length === 1 && puzzle.hint) {
    parts.push(puzzle.hint);
  }
  if (parts.length === 1 && puzzle.theme) {
    parts.push(`This position calls for the "${puzzle.theme}" idea.`);
  }

  return trimToShortConcept(parts.join(" "));
}

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

  // SSR ships the first lesson puzzle inside the page (generated on the
  // server, embedded as window.__INITIAL_PUZZLE__). The browser adopts it
  // here so its first render shows the SAME board the server already sent,
  // with no loading flash and no second, randomly generated puzzle.
  const [initialPuzzle] = useState(() =>
    typeof window === "undefined"
      ? buildServerPuzzle(initialIndex)
      : readEmbeddedPuzzle(initialIndex),
  );

  const [puzzle, setPuzzle] = useState(initialPuzzle);
  const [position, setPosition] = useState(initialPuzzle ? initialPuzzle.fen : "");
  const [initializing, setInitializing] = useState(!initialPuzzle);
  const [generationError, setGenerationError] = useState(null);
  const [willPlayFollowup, setWillPlayFollowup] = useState(false);
  const [solved, setSolved] = useState(false);
  const [wrongMove, setWrongMove] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);

  // AI explanation state for incorrect puzzle moves
  const [llmDescription, setLlmDescription] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [lessonConcept, setLessonConcept] = useState(null);

  const generationRequestRef = useRef(0);
  const explanationRequestRef = useRef(0);
  const lessonConceptRequestRef = useRef(0);
  const timerIds = useRef([]);
  // Set once this session has progressed past its starting stats, so a slow
  // stats load never overwrites progress the user just made.
  const statsTouchedRef = useRef(false);
  // Whether the account baseline is known for this session: 'loading' until
  // getPuzzleStats() resolves (logged-in only), 'failed' when it cannot be
  // fetched, 'ready' otherwise. The adopted SSR puzzle is playable before
  // that request resolves, so progress is only marked touched and persisted
  // once the baseline is known — a save built from the default counters
  // would overwrite the account's real progress, and touching first would
  // stop the pending response from restoring it.
  const statsStatusRef = useRef(isLoggedIn ? "loading" : "ready");

  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [puzzleRating, setPuzzleRating] = useState(PUZZLE_RATING_START);

  // Load the user's saved puzzle stats from the database so Solved, Streak,
  // Best, and the rating survive reloads and devices. Guests (or offline
  // sessions) simply keep session-only stats, as before. The effect follows
  // the login state so signing in through the header modal picks up the
  // account's saved rating before the first save could overwrite it with
  // session-only defaults.
  useEffect(() => {
    if (!isLoggedIn) {
      // Guests have no account baseline to wait for; session-only stats
      // keep saving exactly as before.
      statsStatusRef.current = "ready";
      // Signed out: drop any session-only counters so they can never be
      // saved over the account's persisted stats after the next sign-in.
      setSolvedCount(0);
      setAttemptedCount(0);
      setStreak(0);
      setBestStreak(0);
      setPuzzleRating(PUZZLE_RATING_START);
      statsTouchedRef.current = false;
      return;
    }
    // A fresh sign-in makes the account row the source of truth, even if
    // session-only stats were touched while logged out.
    statsTouchedRef.current = false;
    statsStatusRef.current = "loading";
    let cancelled = false;
    api
      .getPuzzleStats()
      .then((data) => {
        if (cancelled) return;
        // The response (even without a stats row) is the baseline, so
        // progress saves may resume.
        statsStatusRef.current = "ready";
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
        // Stats stay session-only when the backend is unreachable — and so
        // does progress: without the account baseline a save built from the
        // default counters could overwrite unknown account values.
        if (!cancelled) statsStatusRef.current = "failed";
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

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
    setSelectedSquare(null);

    const lesson = LESSON_CATALOG[lessonIndex] || LESSON_CATALOG[0];

    try {
      const difficulty = difficultyForRating(puzzleRating);
      const freshPuzzle = await requestLessonPuzzle({ lesson, seed, difficulty });

      if (generationRequestRef.current !== requestId) return false;

      setPuzzle({
        ...freshPuzzle,
        lessonIndex,
        lessonTitle: lesson.title,
        lessonTopic: lesson.topic,
        lessonOrder: lesson.order,
        difficulty: difficultyForRating(puzzleRating),
      });
      setPosition(freshPuzzle.fen);
      setSolved(false);
      setWrongMove(false);
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
    // The embedded SSR payload is one-shot: consume it on first mount so
    // later client-side visits to this page generate a fresh puzzle.
    if (typeof window !== "undefined") {
      delete window[INITIAL_PUZZLE_KEY];
    }
    // Keep the server-rendered (adopted) puzzle for its own lesson instead of
    // immediately replacing the SSR first paint with a new random puzzle.
    if (!puzzle || puzzle.lessonIndex !== currentLessonIndex) {
      loadPuzzleForLesson(currentLessonIndex);
    }
    return () => {
      generationRequestRef.current += 1;
      clearTimers();
    };
  }, [currentLessonIndex]);

  // The Lesson Concept card describes THIS generated puzzle, not the lesson's
  // static prose. The AI coach (Pollinations) names the motif for the exact
  // position; a local position-aware fallback keeps the card useful when the
  // coach is disconnected or errors.
  useEffect(() => {
    if (!puzzle) return;
    const requestId = ++lessonConceptRequestRef.current;
    setLessonConcept(buildPuzzleConceptFallback(puzzle));

    getLessonConcept({
      fen: puzzle.fen,
      sideToMove: puzzle.sideToMove,
      theme: puzzle.theme,
      hint: puzzle.hint,
      lessonTitle: puzzle.lessonTitle || currentLesson.title,
      lessonTopic: puzzle.lessonTopic || currentLesson.topic,
    })
      .then((concept) => {
        if (requestId === lessonConceptRequestRef.current && concept) {
          setLessonConcept(concept);
        }
      })
      .catch(() => {
        // Keep the position-aware fallback; the AI coach is user-optional.
      });
  }, [puzzle?.id, puzzle?.fen]);

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
          setLlmDescription(trimToShortConcept(explanation));
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

    setAttemptedCount(nextAttempted);
    setSolvedCount(nextSolved);
    setStreak(nextStreak);
    setBestStreak(nextBestStreak);
    setPuzzleRating(nextRating);
    // Mark touched and persist only once the account baseline is known;
    // while it is still loading (or after a failed load) the counters stay
    // session-only so default values can never overwrite real account
    // progress. The board and navigation are never blocked by this.
    if (statsStatusRef.current === "ready") {
      statsTouchedRef.current = true;
      persistPuzzleStats({
        solvedCount: nextSolved,
        attemptedCount: nextAttempted,
        // Must match the server contract (PUT /api/puzzles/stats/user expects
        // currentStreak); a stray key makes the save fail validation and the
        // rating never reaches the database.
        currentStreak: nextStreak,
        bestStreak: nextBestStreak,
        rating: nextRating,
      });
    }

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
      setSolved(false);
      explainWrongMove(position, move.san, chess.fen());
      return false;
    }

    setPosition(chess.fen());
    setSolved(true);
    setWrongMove(false);
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

  /**
   * Highlights the square of the piece the solver is supposed to move — the
   * `from` square of the puzzle's solution — so the Hint button gives a
   * visual nudge on the board alongside the text hint card.
   */
  function hintSquare() {
    if (!showHint || !puzzle || !position) return null;
    try {
      const probe = loadFen(position);
      const move = probe.move(puzzle.solution);
      return move?.from || null;
    } catch {
      return null;
    }
  }

  function hintSquareStyles() {
    const from = hintSquare();
    if (!from) return {};
    return {
      [from]: {
        boxShadow: "inset 0 0 0 4px rgba(255, 215, 0, 0.7)",
      },
    };
  }

  const boardStyles = solved
    ? lastMoveSquares(game)
    : { ...hintSquareStyles(), ...selectedSquareStyles() };

  return (
    <div className="puzzles-page">
      {/* Server-only: hand the rendered puzzle to the client bundle so its
          first React render adopts this exact board instead of regenerating.
          An inline classic script runs during HTML parsing, i.e. before the
          deferred module bundle, so the payload is always in place. */}
      {typeof window === "undefined" && initialPuzzle && (
        <script
          dangerouslySetInnerHTML={{
            __html: `window[${JSON.stringify(INITIAL_PUZZLE_KEY)}]=${serializeInitialPuzzle({
              lessonIndex: initialIndex,
              puzzle: initialPuzzle,
            })};`,
          }}
        />
      )}
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
                {trimToShortConcept(lessonConcept || buildPuzzleConceptFallback(puzzle))}
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
