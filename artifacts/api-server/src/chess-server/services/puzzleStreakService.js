/**
 * Puzzle Streak Service
 *
 * The daily puzzle streak lives on the account, not on a device: solving on
 * your phone and on your laptop is the same streak, and a new browser does not
 * reset it.
 *
 * Rules:
 * - One solve counts per day, no matter how many times the puzzle is opened.
 * - Solving tomorrow continues the streak; a missed day restarts it at 1.
 * - `best_streak` is the highest the streak has ever reached and never falls.
 *
 * Days are `CURRENT_DATE` in the database's timezone (UTC on most hosts),
 * matching the puzzle quota, so every API instance agrees on "today".
 */

import { query } from '../db.js';

// A streak continues when the last solve was yesterday. Kept as one SQL
// expression used twice (current and best) so the two can never drift.
const NEXT_COUNT = `CASE
        WHEN puzzle_streak.last_solved_on = CURRENT_DATE THEN puzzle_streak.current_streak
        WHEN puzzle_streak.last_solved_on = CURRENT_DATE - 1 THEN puzzle_streak.current_streak + 1
        ELSE 1
      END`;

function toStreak(row) {
  if (!row) {
    return { currentStreak: 0, bestStreak: 0, lastSolvedOn: null, solvedToday: false };
  }
  return {
    currentStreak: Number(row.current_streak) || 0,
    bestStreak: Number(row.best_streak) || 0,
    lastSolvedOn: row.last_solved_on || null,
    solvedToday: Boolean(row.solved_today),
  };
}

/**
 * The account's streak as it should be shown today.
 *
 * A row whose last solve is older than yesterday is reported as a zero streak
 * (with `bestStreak` intact) instead of leaving a stale number on screen until
 * the player happens to solve again.
 *
 * @param {string} userId
 * @returns {Promise<{currentStreak: number, bestStreak: number, lastSolvedOn: string|null, solvedToday: boolean}>}
 */
export async function getStreak(userId) {
  const { rows } = await query(
    `SELECT
       CASE WHEN last_solved_on >= CURRENT_DATE - 1 THEN current_streak ELSE 0 END AS current_streak,
       best_streak,
       last_solved_on,
       (last_solved_on = CURRENT_DATE) AS solved_today
     FROM puzzle_streak
     WHERE user_id = $1`,
    [userId]
  );
  return toStreak(rows[0]);
}

/**
 * Records today's daily-puzzle solve and returns the updated streak.
 *
 * Idempotent per day: a second call on the same day returns the same numbers
 * instead of adding another day. Safe under concurrency — the whole decision
 * happens inside one atomic upsert.
 *
 * @param {string} userId
 * @returns {Promise<{currentStreak: number, bestStreak: number, lastSolvedOn: string|null, solvedToday: boolean}>}
 */
export async function recordSolve(userId) {
  const { rows } = await query(
    `INSERT INTO puzzle_streak (user_id, current_streak, best_streak, last_solved_on, updated_at)
     VALUES ($1, 1, 1, CURRENT_DATE, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = ${NEXT_COUNT},
       best_streak = GREATEST(puzzle_streak.best_streak, ${NEXT_COUNT}),
       last_solved_on = CURRENT_DATE,
       updated_at = CURRENT_TIMESTAMP
     RETURNING current_streak, best_streak, last_solved_on, TRUE AS solved_today`,
    [userId]
  );
  return toStreak(rows[0]);
}
