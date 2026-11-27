/**
 * Puzzle Quota Service
 *
 * Enforces the free daily puzzle allowance.
 *
 * - Free play (signed in without an active subscription): 3 puzzles per day.
 * - Subscribers (active Whop membership) and integrity reviewers: unlimited.
 *
 * A puzzle is consumed when the server hands one out, which is the moment the
 * player starts it. The day boundary is `CURRENT_DATE` in the database's
 * timezone (UTC on most hosts), matching the review quota: the counter stays
 * atomic and consistent across every API instance without app-level clocks.
 */

import { query } from '../db.js';
import { FREE_PUZZLE_LIMIT, getEntitlements } from './entitlements.js';
import { buildUsageSummary } from './usageSummary.js';

export const FREE_DAILY_LIMIT = FREE_PUZZLE_LIMIT;

/**
 * Daily puzzle limit for an account: `Infinity` when unlimited, else 3.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getDailyLimit(userId) {
  const entitlements = await getEntitlements(userId);
  return entitlements.puzzleLimit ?? Infinity;
}

/**
 * Reads today's consumed count without incrementing it.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUsedToday(userId) {
  const { rows } = await query(
    'SELECT count FROM puzzle_usage WHERE owner_key = $1 AND usage_date = CURRENT_DATE',
    [`user:${userId}`]
  );
  return rows[0] ? Number(rows[0].count) || 0 : 0;
}

/**
 * Atomically increments today's puzzle count and returns the new total.
 * Call only after a puzzle has actually been handed out.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function consumePuzzle(userId) {
  const { rows } = await query(
    `INSERT INTO puzzle_usage (owner_key, usage_date, count, updated_at)
     VALUES ($1, CURRENT_DATE, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (owner_key, usage_date)
     DO UPDATE SET count = puzzle_usage.count + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING count`,
    [`user:${userId}`]
  );
  return Number(rows[0]?.count) || 1;
}

/**
 * Current usage summary for the UI plus the gate decision.
 *
 * @param {string} userId
 * @returns {Promise<{used: number, limit: number|null, remaining: number|null, unlimited: boolean, allowed: boolean, resetsAt: string}>}
 */
export async function getUsage(userId) {
  const [limit, used] = await Promise.all([getDailyLimit(userId), getUsedToday(userId)]);
  return buildUsageSummary(limit, used);
}
