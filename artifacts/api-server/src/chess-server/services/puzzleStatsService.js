/**
 * Puzzle Stats Service
 *
 * Persists the puzzles page progress (solved count, attempted count,
 * current streak, best streak, rating) for an authenticated user in the
 * `puzzle_stats` table, so stats survive reloads and follow the user
 * across devices.
 */

import { query } from '../db.js';

const RATING_START = 400;
const MAX_COUNT = 1000000;
const MAX_STREAK = 1000000;
const MIN_RATING = 100;
const MAX_RATING = 4000;

export function emptyStats() {
  return {
    solvedCount: 0,
    attemptedCount: 0,
    currentStreak: 0,
    bestStreak: 0,
    rating: RATING_START,
    updatedAt: null,
  };
}

function clampCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_COUNT, Math.floor(n)));
}

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return RATING_START;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.floor(n)));
}

function mapRow(row) {
  if (!row) return emptyStats();
  return {
    solvedCount: row.solved_count ?? 0,
    attemptedCount: row.attempted_count ?? 0,
    currentStreak: row.current_streak ?? 0,
    bestStreak: row.best_streak ?? 0,
    rating: row.rating ?? RATING_START,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getStats(userId) {
  const result = await query(
    `SELECT solved_count, attempted_count, current_streak, best_streak, rating, updated_at
     FROM puzzle_stats
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function saveStats(userId, stats = {}) {
  const body = stats || {};
  const values = [
    userId,
    clampCount(body.solvedCount),
    clampCount(body.attemptedCount),
    clampCount(body.currentStreak),
    clampCount(body.bestStreak),
    clampRating(body.rating),
  ];
  const result = await query(
    `INSERT INTO puzzle_stats
       (user_id, solved_count, attempted_count, current_streak, best_streak, rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       solved_count = EXCLUDED.solved_count,
       attempted_count = EXCLUDED.attempted_count,
       current_streak = EXCLUDED.current_streak,
       best_streak = EXCLUDED.best_streak,
       rating = EXCLUDED.rating,
       updated_at = CURRENT_TIMESTAMP
     RETURNING solved_count, attempted_count, current_streak, best_streak, rating, updated_at`,
    values
  );
  return mapRow(result.rows[0]);
}

export default { emptyStats, getStats, saveStats };
