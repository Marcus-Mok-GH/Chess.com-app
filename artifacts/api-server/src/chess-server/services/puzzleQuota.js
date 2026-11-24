/**
 * Puzzle Quota Service
 *
 * Enforces the free daily puzzle allowance.
 *
 * - Free play (signed in without an active subscription): 3 puzzles per day.
 * - Guests: 3 puzzles per day, tracked per device through the httpOnly
 *   `chess_visitor` cookie so a visitor who never signs in still gets the
 *   same allowance instead of unlimited play.
 * - Subscribers (active Whop membership) and integrity reviewers: unlimited.
 *
 * A puzzle is consumed when the server hands one out, which is the moment the
 * player starts it. The day boundary is `CURRENT_DATE` in the database's
 * timezone (UTC on most hosts), matching the review quota: the counter stays
 * atomic and consistent across every API instance without app-level clocks.
 */

import crypto from 'node:crypto';
import { query } from '../db.js';
import { authenticatedUserId } from '../coachAuth.js';
import { FREE_PUZZLE_LIMIT, getEntitlements } from './entitlements.js';
import { buildUsageSummary } from './usageSummary.js';

export const FREE_DAILY_LIMIT = FREE_PUZZLE_LIMIT;
export const VISITOR_COOKIE = 'chess_visitor';

const VISITOR_ID_PATTERN = /^[a-f0-9]{32}$/;
const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const USER_PREFIX = 'user:';
const ANON_PREFIX = 'anon:';

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key !== name) continue;
    try { return decodeURIComponent(valueParts.join('=')); } catch { return valueParts.join('='); }
  }
  return null;
}

/**
 * Stable anonymous identity for a guest, created on first use.
 *
 * The id lives in an httpOnly cookie so it cannot be read by page scripts and
 * survives reloads. Clearing cookies starts a fresh allowance — an accepted
 * trade-off for keeping signed-out play measurable without an account.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string} 32 hex characters.
 */
export function visitorId(req, res) {
  const existing = readCookie(req?.headers?.cookie, VISITOR_COOKIE);
  if (existing && VISITOR_ID_PATTERN.test(existing)) return existing;

  const id = crypto.randomBytes(16).toString('hex');
  if (res && typeof res.cookie === 'function') {
    res.cookie(VISITOR_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE_MS,
    });
  }
  return id;
}

/**
 * Quota identity for this request: the account when signed in, else the device.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<string>} `user:<id>` or `anon:<visitorId>`.
 */
export async function ownerKeyFor(req, res) {
  const userId = await authenticatedUserId(req);
  if (userId) return `${USER_PREFIX}${userId}`;
  return `${ANON_PREFIX}${visitorId(req, res)}`;
}

/**
 * Daily puzzle limit for an owner key: `Infinity` when unlimited, else 3.
 *
 * @param {string} ownerKey
 * @returns {Promise<number>}
 */
export async function getDailyLimit(ownerKey) {
  if (!String(ownerKey).startsWith(USER_PREFIX)) return FREE_DAILY_LIMIT;
  const userId = String(ownerKey).slice(USER_PREFIX.length);
  const entitlements = await getEntitlements(userId);
  return entitlements.puzzleLimit ?? Infinity;
}

/**
 * Reads today's consumed count without incrementing it.
 *
 * @param {string} ownerKey
 * @returns {Promise<number>}
 */
export async function getUsedToday(ownerKey) {
  const { rows } = await query(
    'SELECT count FROM puzzle_usage WHERE owner_key = $1 AND usage_date = CURRENT_DATE',
    [ownerKey]
  );
  return rows[0] ? Number(rows[0].count) || 0 : 0;
}

/**
 * Atomically increments today's puzzle count and returns the new total.
 * Call only after a puzzle has actually been handed out.
 *
 * @param {string} ownerKey
 * @returns {Promise<number>}
 */
export async function consumePuzzle(ownerKey) {
  const { rows } = await query(
    `INSERT INTO puzzle_usage (owner_key, usage_date, count, updated_at)
     VALUES ($1, CURRENT_DATE, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (owner_key, usage_date)
     DO UPDATE SET count = puzzle_usage.count + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING count`,
    [ownerKey]
  );
  return Number(rows[0]?.count) || 1;
}

/**
 * Current usage summary for the UI plus the gate decision.
 *
 * @param {string} ownerKey
 * @returns {Promise<{used: number, limit: number|null, remaining: number|null, unlimited: boolean, allowed: boolean, resetsAt: string}>}
 */
export async function getUsage(ownerKey) {
  const [limit, used] = await Promise.all([getDailyLimit(ownerKey), getUsedToday(ownerKey)]);
  return buildUsageSummary(limit, used);
}
