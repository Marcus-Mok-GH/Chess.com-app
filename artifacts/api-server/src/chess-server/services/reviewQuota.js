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

export const FREE_DAILY_LIMIT = 1;

/** Statuses that grant unlimited reviews. */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Whether a subscription row currently entitles the user to unlimited reviews.
 *
 * @param {{status?: string, current_period_end?: string|Date|null}|null|undefined} row
 * @returns {boolean}
 */
export function subscriptionIsActive(row) {
  if (!row || !ENTITLED_STATUSES.has(String(row.status || '').toLowerCase())) {
    return false;
  }
  if (!row.current_period_end) return true;
  const end = new Date(row.current_period_end);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() > Date.now();
}

/**
 * Reads the user's subscription row, if any.
 *
 * @param {string} userId
 * @returns {Promise<{status: string, current_period_end: string|Date|null}|null>}
 */
async function getSubscriptionRow(userId) {
  const { rows } = await query(
    'SELECT status, current_period_end FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

/**
 * Daily review limit for a user: `Infinity` when subscribed, else 1.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getDailyLimit(userId) {
  const row = await getSubscriptionRow(userId);
  return subscriptionIsActive(row) ? Infinity : FREE_DAILY_LIMIT;
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
  const unlimited = !Number.isFinite(limit);

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  return {
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    allowed: unlimited || used < limit,
    resetsAt: tomorrow.toISOString(),
  };
}