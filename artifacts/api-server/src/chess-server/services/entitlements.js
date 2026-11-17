/**
 * Entitlements
 *
 * One place that answers "what is this account allowed to do?", so a plan
 * change (or an admin account) never has to be re-implemented inside each
 * feature's gate.
 *
 * Three plans:
 * - `free`    — 3 puzzles and 1 game review per day, standard bots only.
 * - `premium` — an active Whop membership: unlimited puzzles and reviews,
 *               premium bots, every feature at full strength.
 * - `admin`   — integrity reviewers. Treated as the highest plan: everything
 *               premium has, plus moderation surfaces. Admin is decided first
 *               and never queries the subscription table.
 */

import { query } from '../db.js';
import { isIntegrityReviewer } from './antiCheatService.js';

export const PLANS = Object.freeze({ FREE: 'free', PREMIUM: 'premium', ADMIN: 'admin' });

export const FREE_PUZZLE_LIMIT = 3;
export const FREE_REVIEW_LIMIT = 1;

/** Statuses a Whop membership row needs before it counts as premium. */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Whether a subscription row currently entitles the account to premium.
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

function entitlementsFor(plan) {
  const isAdmin = plan === PLANS.ADMIN;
  const premium = isAdmin || plan === PLANS.PREMIUM;
  return {
    plan,
    isAdmin,
    premium,
    premiumBots: premium,
    unlimitedPuzzles: premium,
    puzzleLimit: premium ? null : FREE_PUZZLE_LIMIT,
    unlimitedReviews: premium,
    reviewLimit: premium ? null : FREE_REVIEW_LIMIT,
    // The list the UI prints, in the order it should be read.
    unlocks: premium
      ? ['Unlimited puzzles', 'Unlimited game reviews', 'Premium bots', 'Full analysis']
      : ['3 puzzles a day', '1 game review a day', 'Standard bots'],
  };
}

/**
 * Plan and limits for a user id. Guests (no id) are free play.
 *
 * @param {string|null|undefined} userId
 * @returns {Promise<ReturnType<typeof entitlementsFor>>}
 */
export async function getEntitlements(userId) {
  if (!userId) return entitlementsFor(PLANS.FREE);
  if (isIntegrityReviewer(userId)) return entitlementsFor(PLANS.ADMIN);

  const { rows } = await query(
    'SELECT status, current_period_end FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  return entitlementsFor(subscriptionIsActive(rows[0]) ? PLANS.PREMIUM : PLANS.FREE);
}
