import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import { Check, Trophy, Flame } from "lucide-react";
import { generatePuzzle } from "../engine/puzzles/puzzleGenerator";
import { useUser } from "../contexts/UserContext";
import api from "../services/api";
import "./DailyPuzzleStreak.css";
import { useT } from '../i18n/I18nContext';

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

// Accounts keep their streak in the database (see /api/puzzles/streak), so it
// follows the player across devices and browsers. The localStorage helpers
// below exist for signed-out play only: a guest still gets a streak for the
// session's device, and it is dropped the moment they sign in.

// Device-local streak for signed-out play. Accounts read theirs from the
// database through GET /api/puzzles/streak, so this hook is guest-scoped by
// design and takes no user id.
export function useStreakData() {
  const [streak, setStreak] = useState(() => getStreakState(null));

  return { streak, refresh: () => setStreak(getStreakState(null)) };
}

export default function DailyPuzzleStreak({ compact = false, linkToPuzzles = false }) {
  const t = useT();
  const { user, token, isLoggedIn } = useUser();
  const navigate = useNavigate();
  const userId = user?.id || null;
  const username = user?.username || null;

  const today = getTodayDateString();
  const puzzle = useMemo(() => getDailyPuzzle(today), [today]);
  const [streakData, setStreakData] = useState(() => (
    isLoggedIn
      ? { lastDate: "", count: 0, bestStreak: 0, completedToday: false }
      : getStreakState(null)
  ));
  const [showBoard, setShowBoard] = useState(false);
  const [position, setPosition] = useState(puzzle.fen);
  const [solved, setSolved] = useState(streakData.completedToday);
  const [failed, setFailed] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const timerRef = useRef(null);
  const prevUserIdRef = useRef(userId);

  // Signing out drops the account's numbers immediately; signing in blanks
  // them until the server answers, so a device-local guest streak is never
  // shown as if it were the account's.
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      if (userId) {
        setStreakData({ lastDate: "", count: 0, bestStreak: 0, completedToday: false });
        setSolved(false);
      } else {
        const guestState = getStreakState(null);
        setStreakData(guestState);
        setSolved(guestState.completedToday);
      }
    }
  }, [userId]);

  // Accounts read the streak from the database, so a phone and a laptop show
  // the same number. Guests keep the device-local streak from localStorage.
  useEffect(() => {
    if (!isLoggedIn || !userId) {
      setSyncLoading(false);
      return;
    }

    let cancelled = false;
    setSyncLoading(true);

    api
      .getPuzzleStreak()
      .then((data) => {
        if (cancelled) return;
        const remote = data?.streak;
        if (!remote) return;
        setStreakData({
          lastDate: remote.lastSolvedOn || "",
          count: Number(remote.currentStreak) || 0,
          bestStreak: Number(remote.bestStreak) || 0,
          completedToday: Boolean(remote.solvedToday),
        });
        setSolved(Boolean(remote.solvedToday));
      })
      .catch(() => {
        // Unreachable backend: show what we have rather than a wrong number.
      })
      .finally(() => {
        if (!cancelled) setSyncLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, userId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSolve = useCallback(() => {
    const todayStr = getTodayDateString();

    if (isLoggedIn && userId) {
      if (streakData.completedToday) return;
      // Optimistic bump so the counter moves with the move on the board; the
      // server's response replaces it a moment later.
      setStreakData((current) => {
        const nextCount = current.completedToday ? current.count : current.count + 1;
        return {
          lastDate: todayStr,
          count: nextCount,
          bestStreak: Math.max(current.bestStreak, nextCount),
          completedToday: true,
        };
      });
      setSolved(true);
      api
        .recordPuzzleStreak()
        .then((data) => {
          const remote = data?.streak;
          if (!remote) return;
          setStreakData({
            lastDate: remote.lastSolvedOn || todayStr,
            count: Number(remote.currentStreak) || 0,
            bestStreak: Number(remote.bestStreak) || 0,
            completedToday: Boolean(remote.solvedToday),
          });
        })
        .catch((error) => {
          // The streak now lives on the account, so a failed write is reported
          // instead of being silently swallowed: the UI keeps the optimistic
          // number and the next visit re-reads the server.
          console.warn("[DailyPuzzleStreak] Failed to record streak:", error?.message || error);
        });
      return;
    }

    // Guest: device-local streak only.
    const current = getStreakState(null);
    if (current.completedToday) return;
    const newCount = current.count + 1;
    const updated = {
      lastDate: todayStr,
      count: newCount,
      bestStreak: Math.max(current.bestStreak, newCount),
      completedToday: true,
    };
    saveStreakData(updated, null);
    setStreakData(updated);
    setSolved(true);
  }, [isLoggedIn, userId, streakData.completedToday]);

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
          <h2 className="daily-puzzle-streak-title">{t("Daily Puzzle")}</h2>
        </div>
        <div className="daily-puzzle-streak-stats">
          <div className="daily-streak-count">
            <span className="daily-streak-number">{streakData.count}</span>
            <span className="daily-streak-label">{t("day streak")}</span>
          </div>
          <div className="daily-streak-best">
            <Trophy size={14} />
            <span>{t("Best:")}{' '}{streakData.bestStreak}</span>
          </div>
        </div>
      </div>

      {solved || streakData.completedToday ? (
        <div className="daily-puzzle-completed">
          <div className="daily-puzzle-completed-icon">
            <Check size={24} />
          </div>
          <p className="daily-puzzle-completed-text">
            {t("🎉 Great job! You've solved today's puzzle.")}</p>
          <p className="daily-puzzle-completed-sub">{t("Come back tomorrow to keep your streak!")}</p>
        </div>
      ) : (
        <>
          {!showBoard ? (
            <button
              className="daily-puzzle-solve-btn"
              onClick={() => {
                if (linkToPuzzles) {
                  navigate("/puzzles");
                  return;
                }
                setShowBoard(true);
              }}
            >
              <Flame size={18} />
              {t("Solve Today's Puzzle")}</button>
          ) : (
            <div className="daily-puzzle-board-area">
              <div className="daily-puzzle-board-info">
                <span className="daily-puzzle-theme">{t(puzzle.theme)}</span>
                <span className="daily-puzzle-side">
                  {t('{side} to move', { side: t(puzzle.sideToMove === "white" ? "White" : "Black") })}</span>
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
                    {t("Not quite — try again!")}</div>
                )}
              </div>
              {puzzle.hint && (
                <p className="daily-puzzle-hint">💡 {t(puzzle.hint)}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { getDailyPuzzle, getStreakState, saveStreakData, loadStreakData, getTodayDateString };
