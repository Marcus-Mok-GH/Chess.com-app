/**
 * Review Quota Service
 *
 * Enforces the game-review limit for the AI coach.
 *
 * - Free accounts: 1 successful review per calendar day.
 * - Subscribers (active Whop membership): unlimited reviews.
 *
 * Day boundary is `CURRENT_DATE` in the database's timezone (UTC on most
 * hosts). This is deliberate: it keeps the counter atomic and consistent
 * across every API instance without needing app-level clock handling.
 *
 * Only successful reviews consume the daily allowance. The route calls
 * `consumeReview` after the coach returns at least one reviewed move, so a
 * failed or empty review never costs the user their free review.
 */

import { query } from '../db.js';
import { FREE_REVIEW_LIMIT, getEntitlements, subscriptionIsActive } from './entitlements.js';
import { buildUsageSummary } from './usageSummary.js';

export const FREE_DAILY_LIMIT = FREE_REVIEW_LIMIT;

// Kept as a re-export: callers have been importing the check from here.
export { subscriptionIsActive };

/**
 * Daily review limit for a user: `Infinity` on a premium plan or an admin
 * account, else the free allowance. The decision lives in entitlements so a
 * plan change is applied in one place.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getDailyLimit(userId) {
  const entitlements = await getEntitlements(userId);
  return entitlements.reviewLimit ?? Infinity;
}

/**
 * Reads today's consumed count without incrementing it.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUsedToday(userId) {
  const { rows } = await query(
    'SELECT count FROM review_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE',
    [userId]
  );
  return rows[0] ? Number(rows[0].count) || 0 : 0;
}

/**
 * Atomically increments today's review count and returns the new total.
 * Call only after a review has actually produced results.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function consumeReview(userId) {
  const { rows } = await query(
    `INSERT INTO review_usage (user_id, usage_date, count, updated_at)
     VALUES ($1, CURRENT_DATE, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = review_usage.count + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING count`,
    [userId]
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
