import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import { Check, Trophy, Flame } from "lucide-react";
import { generatePuzzle } from "../engine/puzzles/puzzleGenerator";
import { useUser } from "../contexts/UserContext";
import api from "../services/api";
import "./DailyPuzzleStreak.css";

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDailyPuzzleSeed(dateStr) {
  let hash = 2166136261;
  for (let index = 0; index < dateStr.length; index += 1) {
    hash ^= dateStr.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDailyPuzzle(dateStr) {
  // Date-derived seeding keeps the puzzle consistent for the entire day while
  // generating a real tactical position rather than rotating a fixed diagram.
  const puzzle = generatePuzzle(getDailyPuzzleSeed(dateStr), { type: "tactics" });
  return { ...puzzle, id: `daily-${dateStr}`, generationMethod: "daily-tactical-position" };
}

function getStoragePrefix(userId) {
  return userId ? `puzzleStreak_${userId}_` : "puzzleStreak_";
}

function loadStreakData(userId) {
  const prefix = getStoragePrefix(userId);
  try {
    return {
      lastDate: localStorage.getItem(`${prefix}lastDate`) || "",
      count: parseInt(localStorage.getItem(`${prefix}count`) || "0", 10),
      bestStreak: parseInt(localStorage.getItem(`${prefix}bestStreak`) || "0", 10),
      completedToday: localStorage.getItem(`${prefix}completedToday`) === "true",
    };
  } catch {
    return { lastDate: "", count: 0, bestStreak: 0, completedToday: false };
  }
}

function saveStreakData(data, userId) {
  const prefix = getStoragePrefix(userId);
  try {
    localStorage.setItem(`${prefix}lastDate`, data.lastDate);
    localStorage.setItem(`${prefix}count`, String(data.count));
    localStorage.setItem(`${prefix}bestStreak`, String(data.bestStreak));
    localStorage.setItem(`${prefix}completedToday`, String(data.completedToday));
  } catch {
    // localStorage unavailable
  }
}

function getStreakState(userId) {
  const today = getTodayDateString();
  const data = loadStreakData(userId);

  if (data.lastDate === today) {
    return data;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (data.lastDate === yesterdayStr) {
    const updated = { ...data, completedToday: false };
    saveStreakData(updated, userId);
    return updated;
  }

  // Missed a day — streak resets
  const reset = { lastDate: data.lastDate, count: 0, bestStreak: data.bestStreak, completedToday: false };
  saveStreakData(reset, userId);
  return reset;
}

function mergeStreakData(local, remote) {
  if (!remote) return local;

  // Normalize remote count for date staleness (getStreakState-style)
  // If remote lastDate is older than yesterday, treat remote count as 0 for comparison
  let effectiveRemoteCount = remote.count || 0;
  if (remote.lastDate) {
    const today = getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (remote.lastDate !== today && remote.lastDate !== yesterdayStr) {
      // Remote streak is stale — treat count as 0 for comparison purposes
      effectiveRemoteCount = 0;
    }
  }

  // Take whichever has the higher effective streak count as source of truth
  if (effectiveRemoteCount > local.count) {
    return {
      lastDate: remote.lastDate || local.lastDate,
      count: remote.count,
      bestStreak: Math.max(remote.bestStreak || 0, local.bestStreak || 0),
      completedToday: remote.completedToday ?? local.completedToday,
    };
  }
  return {
    ...local,
    bestStreak: Math.max(local.bestStreak || 0, remote.bestStreak || 0),
  };
}

export function useStreakData() {
  const { user } = useUser();
  const userId = user?.id || null;
  const [streak, setStreak] = useState(() => getStreakState(userId));

  useEffect(() => {
    setStreak(getStreakState(userId));
  }, [userId]);

  return { streak, refresh: () => setStreak(getStreakState(userId)) };
}

export default function DailyPuzzleStreak({ compact = false }) {
  const { user, token, isLoggedIn } = useUser();
  const userId = user?.id || null;
  const username = user?.username || null;

  const today = getTodayDateString();
  const puzzle = useMemo(() => getDailyPuzzle(today), [today]);
  const [streakData, setStreakData] = useState(() => getStreakState(userId));
  const [showBoard, setShowBoard] = useState(false);
  const [position, setPosition] = useState(puzzle.fen);
  const [solved, setSolved] = useState(streakData.completedToday);
  const [failed, setFailed] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const timerRef = useRef(null);
  const prevUserIdRef = useRef(userId);

  // Reload streak data when user logs in/out
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      const newState = getStreakState(userId);
      setStreakData(newState);
      setSolved(newState.completedToday);
    }
  }, [userId]);

  // Sync with backend on mount when logged in, and when user changes
  useEffect(() => {
    if (!isLoggedIn || !username || !token) {
      setSyncLoading(false);
      return;
    }

    let cancelled = false;
    setSyncLoading(true);

    async function syncFromBackend() {
      try {
        const response = await api.getUserSettings(username, token);
        if (cancelled) return;
        const remote = response?.settings?.puzzleStreak || null;
        const local = getStreakState(userId);
        const merged = mergeStreakData(local, remote);

        // Apply streak-state logic to merged data (handles day transitions)
        const todayStr = getTodayDateString();
        let finalState = merged;
        if (merged.lastDate !== todayStr) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
          if (merged.lastDate === yesterdayStr) {
            finalState = { ...merged, completedToday: false };
          } else {
            finalState = { lastDate: merged.lastDate, count: 0, bestStreak: merged.bestStreak, completedToday: false };
          }
        }

        saveStreakData(finalState, userId);
        if (!cancelled) {
          setStreakData(finalState);
          setSolved(finalState.completedToday);
        }
      } catch {
        // Backend unavailable — use local cache (already loaded)
      } finally {
        if (!cancelled) setSyncLoading(false);
      }
    }

    syncFromBackend();
    return () => { cancelled = true; };
  }, [isLoggedIn, username, token, userId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const persistStreak = useCallback((data) => {
    // Always write to localStorage
    saveStreakData(data, userId);

    // If logged in, also persist to backend (fetch existing settings first to avoid full-replace wipe)
    if (isLoggedIn && username && token) {
      api.getUserSettings(username, token).then((response) => {
        const currentSettings = response?.settings || {};
        return api.updateUserSettings(username, {
          ...currentSettings,
          puzzleStreak: {
            count: data.count,
            bestStreak: data.bestStreak,
            lastDate: data.lastDate,
            completedToday: data.completedToday,
          },
        }, token);
      }).catch(() => {
        // Silently fail — localStorage is the fallback
      });
    }
  }, [userId, isLoggedIn, username, token]);

  const handleSolve = useCallback(() => {
    const todayStr = getTodayDateString();
    const current = getStreakState(userId);
    if (current.completedToday) return;

    const newCount = current.count + 1;
    const newBest = Math.max(current.bestStreak, newCount);
    const updated = {
      lastDate: todayStr,
      count: newCount,
      bestStreak: newBest,
      completedToday: true,
    };
    persistStreak(updated);
    setStreakData(updated);
    setSolved(true);
  }, [userId, persistStreak]);

  function handlePieceDrop(sourceSquare, targetSquare) {
    if (solved || streakData.completedToday) return false;

    const chess = new Chess(position);
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

    const moveStr = `${sourceSquare}${targetSquare}`;
    const isSolution = move.san === puzzle.solution || matchesCoordinate(moveStr);

    if (!isSolution) {
      setFailed(true);
      timerRef.current = setTimeout(() => setFailed(false), 1200);
      return false;
    }

    setPosition(chess.fen());
    handleSolve();
    return true;
  }

  function matchesCoordinate(coordStr) {
    try {
      const probe = new Chess(position);
      const probeMove = probe.move(puzzle.solution);
      return probeMove && probeMove.from + probeMove.to === coordStr;
    } catch {
      return false;
    }
  }

  function canDragPiece(pieceType) {
    if (solved || streakData.completedToday) return false;
    const sideChar = puzzle.sideToMove === "white" ? "w" : "b";
    return pieceType[0] === sideChar;
  }

  if (compact) {
    return (
      <div className="daily-streak-badge">
        <span className="daily-streak-badge-flame">🔥</span>
        <span className="daily-streak-badge-count">{streakData.count}</span>
      </div>
    );
  }

  return (
    <div className="daily-puzzle-streak">
      {syncLoading && (
        <div className="daily-puzzle-streak-loading">
          <div className="daily-puzzle-streak-spinner" />
        </div>
      )}
      <div className="daily-puzzle-streak-header">
        <div className="daily-puzzle-streak-title-row">
          <span className="daily-puzzle-flame">🔥</span>
          <h2 className="daily-puzzle-streak-title">Daily Puzzle</h2>
        </div>
        <div className="daily-puzzle-streak-stats">
          <div className="daily-streak-count">
            <span className="daily-streak-number">{streakData.count}</span>
            <span className="daily-streak-label">day streak</span>
          </div>
          <div className="daily-streak-best">
            <Trophy size={14} />
            <span>Best: {streakData.bestStreak}</span>
          </div>
        </div>
      </div>

      {solved || streakData.completedToday ? (
        <div className="daily-puzzle-completed">
          <div className="daily-puzzle-completed-icon">
            <Check size={24} />
          </div>
          <p className="daily-puzzle-completed-text">
            🎉 Great job! You've solved today's puzzle.
          </p>
          <p className="daily-puzzle-completed-sub">Come back tomorrow to keep your streak!</p>
        </div>
      ) : (
        <>
          {!showBoard ? (
            <button
              className="daily-puzzle-solve-btn"
              onClick={() => setShowBoard(true)}
            >
              <Flame size={18} />
              Solve Today's Puzzle
            </button>
          ) : (
            <div className="daily-puzzle-board-area">
              <div className="daily-puzzle-board-info">
                <span className="daily-puzzle-theme">{puzzle.theme}</span>
                <span className="daily-puzzle-side">
                  {puzzle.sideToMove === "white" ? "White" : "Black"} to move
                </span>
              </div>
              <div className="daily-puzzle-board-wrap">
                <ChessBoard
                  position={position}
                  onPieceDrop={handlePieceDrop}
                  canDragPiece={canDragPiece}
                  boardOrientation={puzzle.sideToMove}
                  boardTheme="green"
                />
                {failed && (
                  <div className="daily-puzzle-result daily-puzzle-result--failed">
                    Not quite — try again!
                  </div>
                )}
              </div>
              {puzzle.hint && (
                <p className="daily-puzzle-hint">💡 {puzzle.hint}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { getDailyPuzzle, getStreakState, saveStreakData, loadStreakData, getTodayDateString };
