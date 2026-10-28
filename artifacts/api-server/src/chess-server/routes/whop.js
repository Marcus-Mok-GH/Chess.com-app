// @ts-nocheck
/**
 * Whop subscription webhook.
 *
 * Verifies the Svix-style HMAC signature Whop sends on every delivery, then
 * mirrors membership state into the local `subscriptions` table. The review
 * quota service reads that table on each `/coach/analyze` request, so this
 * route is the only writer of entitlement state.
 *
 * Signature scheme (Whop uses Svix headers):
 *   webhook-id, webhook-timestamp, webhook-signature
 *   signed content = `${id}.${timestamp}.${rawBody}`
 *   key            = base64-decoded bytes of the secret after the `whsec_` prefix
 *   header value   = space-delimited list of `v1,<base64 hmac sha256>`
 *
 * The raw body MUST reach this handler untouched; it is mounted before the
 * global express.json() middleware in app.ts.
 */

import crypto from 'node:crypto';
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

const TOLERANCE_SECONDS = 5 * 60;

/** Statuses that should grant unlimited reviews. */
const ACTIVE_EVENTS = new Set([
  'membership.activated',
  'membership.went_valid',
  'payment.succeeded',
]);

const INACTIVE_EVENTS = new Set([
  'membership.deactivated',
  'membership.went_invalid',
  'membership.canceled',
  'payment.failed',
]);

/**
 * Decodes the signing key. Whop secrets are `whsec_` + base64.
 *
 * @param {string} secret
 * @returns {Buffer}
 */
function signingKey(secret) {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return Buffer.from(raw, 'utf8');
  }
}

/**
 * Verifies a Svix-style signature header against the raw payload.
 *
 * @param {string} rawBody
 * @param {{id?: string, timestamp?: string, signature?: string}} headers
 * @param {string} secret
 * @returns {boolean}
 */
function verifySignature(rawBody, headers, secret) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', signingKey(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  const expectedBuf = Buffer.from(expected, 'utf8');

  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const providedBuf = Buffer.from(value, 'utf8');
    if (
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Pulls the first defined value from a list of candidate paths.
 *
 * @param {any} source
 * @param {string[]} paths dot-delimited
 * @returns {any}
 */
function pick(source, paths) {
  for (const path of paths) {
    let node = source;
    let found = true;
    for (const key of path.split('.')) {
      if (node == null || typeof node !== 'object' || !(key in node)) {
        found = false;
        break;
      }
      node = node[key];
    }
    if (found && node !== undefined && node !== null && node !== '') return node;
  }
  return null;
}

/**
 * Normalises a Whop membership payload into our storage shape.
 *
 * @param {any} data
 * @returns {{membershipId: string|null, planId: string|null, status: string|null, periodEnd: Date|null, email: string|null, whopUserId: string|null}}
 */
function normaliseMembership(data) {
  const membershipId = pick(data, ['id', 'membership_id', 'membership.id']);
  const planId = pick(data, ['plan_id', 'plan.id', 'renewal_plan_id']);
  const status = pick(data, ['status', 'membership_status', 'valid']);
  const rawPeriodEnd = pick(data, [
    'renewal_period_end',
    'current_period_end',
    'expires_at',
    'valid_until',
  ]);
  const email = pick(data, ['email', 'user.email', 'customer.email', 'metadata.email']);
  const whopUserId = pick(data, ['user_id', 'user.id', 'customer.id']);

  let periodEnd = null;
  if (rawPeriodEnd) {
    if (typeof rawPeriodEnd === 'number') {
      periodEnd = new Date(rawPeriodEnd * 1000);
    } else {
      const parsed = new Date(rawPeriodEnd);
      if (!Number.isNaN(parsed.getTime())) periodEnd = parsed;
    }
  }

  return {
    membershipId: membershipId ? String(membershipId) : null,
    planId: planId ? String(planId) : null,
    status: typeof status === 'boolean' ? (status ? 'active' : 'inactive') : status ? String(status) : null,
    periodEnd,
    email: email ? String(email) : null,
    whopUserId: whopUserId ? String(whopUserId) : null,
  };
}

/**
 * Resolves the local user id for a membership, by email or by an existing
 * subscriptions row keyed on the membership id.
 *
 * @param {{membershipId: string|null, email: string|null}} membership
 * @returns {Promise<string|null>}
 */
async function resolveUserId(membership) {
  if (membership.membershipId) {
    const existing = await query(
      'SELECT user_id FROM subscriptions WHERE whop_membership_id = $1',
      [membership.membershipId]
    );
    if (existing.rows[0]?.user_id) return existing.rows[0].user_id;
  }

  if (membership.email) {
    const byEmail = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [membership.email]
    );
    if (byEmail.rows[0]?.id) return byEmail.rows[0].id;
  }

  return null;
}

/**
 * Upserts the subscription row for a resolved user.
 *
 * @param {string} userId
 * @param {{membershipId: string|null, planId: string|null, status: string|null, periodEnd: Date|null}} membership
 */
async function upsertSubscription(userId, membership) {
  await query(
    `INSERT INTO subscriptions (user_id, whop_membership_id, whop_plan_id, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       whop_membership_id = EXCLUDED.whop_membership_id,
       whop_plan_id = EXCLUDED.whop_plan_id,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      membership.membershipId,
      membership.planId,
      membership.status || 'inactive',
      membership.periodEnd,
    ]
  );
}

router.post(
  '/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Whop] WHOP_WEBHOOK_SECRET is not configured; rejecting delivery');
      return res.status(503).json({ error: 'webhook_not_configured' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

    const headers = {
      id: /** @type {string|undefined} */ (req.get('webhook-id')),
      timestamp: /** @type {string|undefined} */ (req.get('webhook-timestamp')),
      signature: /** @type {string|undefined} */ (req.get('webhook-signature')),
    };

    if (!verifySignature(rawBody, headers, secret)) {
      console.warn('[Whop] Signature verification failed for delivery', headers.id || '<no id>');
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }

    const type = String(event?.type || event?.event || '');
    const data = event?.data ?? event?.payload ?? {};

    try {
      if (ACTIVE_EVENTS.has(type) || INACTIVE_EVENTS.has(type)) {
        const membership = normaliseMembership(data);

        if (!membership.membershipId) {
          console.warn('[Whop] Event', type, 'has no membership id; ignoring');
          return res.status(200).json({ received: true, ignored: 'no_membership_id' });
        }

        if (INACTIVE_EVENTS.has(type) && !membership.status) {
          membership.status = 'inactive';
        }
        if (ACTIVE_EVENTS.has(type) && !membership.status) {
          membership.status = 'active';
        }

        const userId = await resolveUserId(membership);
        if (!userId) {
          console.warn('[Whop] No local user matches membership', membership.membershipId);
          return res.status(200).json({ received: true, ignored: 'no_matching_user' });
        }

        await upsertSubscription(userId, membership);
        console.log('[Whop] Synced', type, 'for user', userId, '->', membership.status);
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Whop] Failed to process delivery:', err?.message || err);
      // Non-2xx asks Whop to retry; the upserts are idempotent.
      return res.status(500).json({ error: 'processing_failed' });
    }
  }
);

export default router;
