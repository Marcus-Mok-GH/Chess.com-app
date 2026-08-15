import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import DailyPuzzleStreak from "../components/DailyPuzzleStreak";
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
  Brain,
  Code2,
  WandSparkles,
} from "lucide-react";
import {
  BASE_PUZZLES,
  generatePuzzleAsync,
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

const WORKER_TIMEOUT_MS = 5000;

async function fetchPuzzleFromAPI(options = {}) {
  try {
    const params = new URLSearchParams();
    if (options.difficulty) params.append("difficulty", options.difficulty);
    if (options.type) params.append("type", options.type);
    if (options.theme) params.append("theme", options.theme);
    if (options.method) params.append("method", options.method);

    const response = await fetch(`/api/puzzles/generate?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn("API puzzle generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data.puzzle || data;
  } catch (error) {
    console.warn("API puzzle fetch failed:", error.message);
    return null;
  }
}

function generatePuzzleInWorker(seed) {
  if (typeof Worker === "undefined") {
    return Promise.race([
      generatePuzzleAsync(seed),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Puzzle generation timed out.")),
          WORKER_TIMEOUT_MS,
        ),
      ),
    ]);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../engine/puzzles/puzzleGenerator.worker.js", import.meta.url),
      { type: "module" },
    );
    const timeoutId = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Puzzle generation timed out."));
    }, WORKER_TIMEOUT_MS);
    worker.onmessage = ({ data }) => {
      window.clearTimeout(timeoutId);
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.puzzle);
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(event.message || "Puzzle worker failed."));
    };
    worker.postMessage({ seed });
  });
}

async function generatePuzzleSafely(previousPuzzle, sessionId, method = 'rules') {
  try {
    // Try API first with the selected method
    const apiPuzzle = await fetchPuzzleFromAPI({
      difficulty: 'medium',
      type: 'mate-in-1',
      method: method
    });
    if (apiPuzzle && (!previousPuzzle || apiPuzzle.fen !== previousPuzzle.fen)) {
      return apiPuzzle;
    }

    // Fall back to local generation
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const seed = (Date.now() + sessionId + attempt * 2654435761) >>> 0;
      const puzzle = await generatePuzzleInWorker(seed);
      if (!previousPuzzle || puzzle.fen !== previousPuzzle.fen) return puzzle;
    }
    return previousPuzzle ?? fallbackPuzzle();
  } catch {
    return previousPuzzle ?? fallbackPuzzle();
  }
}

export default function Puzzles() {
  const [puzzleNumber, setPuzzleNumber] = useState(1);
  const [puzzle, setPuzzle] = useState(() => fallbackPuzzle());
  const [initializing, setInitializing] = useState(true);
  const [willPlayFollowup, setWillPlayFollowup] = useState(false); // after the solution, black/white auto-plays the followup
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [generationMethod, setGenerationMethod] = useState("auto");
  const sessionIdRef = useRef(Date.now());
  const generationRequestRef = useRef(0);

  // session stats
  const [solvedCount, setSolvedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const timerIds = useRef([]);

  const [position, setPosition] = useState(() => fallbackPuzzle().fen);

  // Track when the selected generation method silently fell back to another
  // method (e.g. Stockfish unavailable, or AI provider down), so the UI can
  // surface that to the user instead of silently switching methods.
  const [methodFallbackReason, setMethodFallbackReason] = useState(null);

  function computeMethodFallbackReason(puzzle, requested) {
    const ef = puzzle.effectiveMethod || puzzle.method;
    if (!ef || !requested || requested === 'auto' || ef === requested || ef === 'procedural-fallback') {
      return null;
    }
    if (ef === 'stockfish-fallback') {
      return `Requested ${requested}, got Stockfish (engine unavailable) after fallback.`;
    }
    return `Requested ${requested}, got ${ef} after fallback.`;
  }

  // Generate the first puzzle asynchronously after mount so the initial render
  // is not blocked by the (worst-case bounded) search inside generatePuzzle.
  useEffect(() => {
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setInitializing(true);
    setMethodFallbackReason(null);
    generatePuzzleSafely(null, sessionIdRef.current, generationMethod).then((p) => {
      if (generationRequestRef.current !== requestId) return;
      setPuzzle(p);
      setPosition(p.fen);
      setSolved(false);
      setFailed(false);
      setShowHint(false);
      setMethodFallbackReason(computeMethodFallbackReason(p, generationMethod));
      setInitializing(false);
    });
    return () => {
      clearTimers();
    };
  }, [generationMethod]);

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

  async function goToNextPuzzle(wasSolved) {
    if (initializing) return;
    const requestId = ++generationRequestRef.current;
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
    setInitializing(true);
    setMethodFallbackReason(null);
    const freshPuzzle = await generatePuzzleSafely(
      puzzle,
      sessionIdRef.current,
      generationMethod
    );
    if (generationRequestRef.current !== requestId) return;
    setPuzzle(freshPuzzle);
    setPosition(freshPuzzle.fen);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setMethodFallbackReason(computeMethodFallbackReason(freshPuzzle, generationMethod));
    setPuzzleNumber((number) => number + 1);
    setInitializing(false);
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
    if (solved || initializing) return false;
    const pieceColor = pieceType[0]; // 'w' or 'b'
    return pieceColor === sideToMove[0];
  }

  async function handleReset() {
    if (initializing) return;
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setInitializing(true);
    setMethodFallbackReason(null);
    const freshPuzzle = await generatePuzzleSafely(
      puzzle,
      sessionIdRef.current,
      generationMethod
    );
    if (generationRequestRef.current !== requestId) return;
    setPuzzle(freshPuzzle);
    setPosition(freshPuzzle.fen);
    setPuzzleNumber((n) => n + 1);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setMethodFallbackReason(computeMethodFallbackReason(freshPuzzle, generationMethod));
    setInitializing(false);
  }

  async function handleSkip() {
    if (initializing) return;
    const requestId = ++generationRequestRef.current;
    clearTimers();
    setStreak(0);
    setInitializing(true);
    setMethodFallbackReason(null);
    const freshPuzzle = await generatePuzzleSafely(
      puzzle,
      sessionIdRef.current,
      generationMethod
    );
    if (generationRequestRef.current !== requestId) return;
    setPuzzle(freshPuzzle);
    setPosition(freshPuzzle.fen);
    setPuzzleNumber((n) => n + 1);
    setSolved(false);
    setFailed(false);
    setShowHint(false);
    setMethodFallbackReason(computeMethodFallbackReason(freshPuzzle, generationMethod));
    setInitializing(false);
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
            <DailyPuzzleStreak compact />
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
                disabled={showHint || initializing}
              >
                <Lightbulb size={16} /> {showHint ? "Hint shown" : "Hint"}
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--skip"
                onClick={handleSkip}
                disabled={initializing}
              >
                <SkipForward size={16} /> Skip
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action--reset"
                onClick={handleReset}
                disabled={initializing}
              >
                <RotateCcw size={16} /> Reset
              </button>
            </div>

            <div className="puzzle-side-card puzzle-generation-card">
              <div className="puzzle-generation-eyebrow">
                <Code2 size={13} /> Generation Method
              </div>
              <div className="puzzle-generation-options">
                <button
                  type="button"
                  className={`puzzle-gen-option puzzle-gen-option--auto ${generationMethod === 'auto' ? 'active' : ''}`}
                  onClick={() => setGenerationMethod('auto')}
                  title="Choose the best available generator for the current puzzle state"
                >
                  <WandSparkles size={14} /> Auto
                </button>
                <button
                  type="button"
                  className={`puzzle-gen-option ${generationMethod === 'rules' ? 'active' : ''}`}
                  onClick={() => setGenerationMethod('rules')}
                  title="Verified rules-based generation"
                >
                  <Brain size={14} /> Rules
                </button>
                <button
                  type="button"
                  className={`puzzle-gen-option ${generationMethod === 'stockfish' ? 'active' : ''}`}
                  onClick={() => setGenerationMethod('stockfish')}
                  title="Stockfish analysis"
                >
                  <Code2 size={14} /> Stockfish
                </button>
                <button
                  type="button"
                  className={`puzzle-gen-option ${generationMethod === 'ai' ? 'active' : ''}`}
                  onClick={() => setGenerationMethod('ai')}
                  title="AI generation"
                >
                  <Code2 size={14} /> AI
                </button>
              </div>
              {methodFallbackReason && (
                <p className="puzzle-generation-fallback" role="status">
                  {methodFallbackReason}
                </p>
              )}
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
