/**
 * /api/auth/* router.
 *
 * Replaces the previous custom 6-digit OTP flow (which used Resend for
 * delivery). Email verification is now delegated end-to-end to Neon Auth
 * (powered by Better Auth + the emailOTP plugin). This router:
 *
 *   1. Proxies OTP request / verification calls to the Neon Auth service
 *      whose URL is `NEON_AUTH_BASE_URL`. Neon handles the email send and
 *      email-OTP storage itself.
 *   2. After a successful sign-in, mints a local session row in the
 *      project's own `sessions` table so the rest of the app (matchmaking,
 *      games, coach) keeps working with the existing Bearer-token flow.
 *   3. Preserves the React client's existing call sites
 *      (`neonAuth.emailOtp.sendVerificationOtp`,
 *       `neonAuth.emailOtp.resendVerificationOtp`,
 *       `neonAuth.signIn.emailOtp`,
 *       `neonAuth.getSession`,
 *       `neonAuth.signOut`).
 *
 * No Resend / SMTP / nodemailer dependency. The local mailer.js was removed.
 */

import express from 'express';
import crypto from 'crypto';

import { query } from '../db/query.js';
import {
  deleteSession,
  validateSession,
} from '../auth.js';

const router = express.Router();

const SESSION_DAYS = 7;
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 30;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function getNeonAuthBase() {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) {
    throw new Error(
      'NEON_AUTH_BASE_URL is not set. Configure it in Vercel environment variables.'
    );
  }
  return base.replace(/\/+$/, '');
}

async function neonFetch(pathname, init = {}) {
  const url = `${getNeonAuthBase()}${pathname}`;
  const headers = {
    accept: 'application/json',
    ...(init.body ? { 'content-type': 'application/json' } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

function ok(res, data) {
  return res.json({ success: true, ...data });
}

function fail(res, status, message) {
  return res.status(status).json({ error: { message } });
}

function neonErrorPayload(response) {
  const body = response.data;
  if (!body) return { status: response.status || 500, message: 'Auth service unavailable. Please try again.' };
  if (typeof body === 'string') return { status: response.status, message: body };
  const message =
    body?.error?.message ||
    body?.message ||
    body?.code ||
    'Auth service request failed.';
  return { status: response.status || 500, message };
}

async function findOrCreateUserByEmail({ email }) {
  const existing = await query(
    `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email, email_verified
       FROM users WHERE email = $1`,
    [email]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const baseUsername = `player_${crypto.randomBytes(4).toString('hex')}`;
  const finalUsername = await resolveUniqueUsername(baseUsername);
  const inserted = await query(
    `INSERT INTO users (id, username, email, email_verified)
     VALUES (gen_random_uuid()::TEXT, $1, $2, TRUE)
     RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email, email_verified`,
    [finalUsername, email]
  );
  return inserted.rows[0];
}

async function resolveUniqueUsername(base) {
  const check = await query(
    `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
    [base]
  );
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base.slice(0, 15)}_${suffix}`;
}

function shapeUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.username,
    email: row.email,
    elo: row.elo ?? 1200,
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    createdAt: row.created_at,
    needsUsername: String(row.username || '').startsWith('player_'),
  };
}

async function mintLocalSession({ user, req }) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, user.id, tokenHash, expiresAt, req.ip || null, req.headers['user-agent'] || null]
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

// --- Compatibility shims for the React client's existing neonAuth client. ---

// POST /api/auth/email-otp/send-verification-otp
// Proxies to Neon Auth: `POST /auth/email-otp/send-verification-otp` (Better Auth
// emailOTP plugin default). Neon owns the email send + the OTP code; we only
// translate the request/response.
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'A valid email is required.');

  try {
    const r = await neonFetch('/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    if (!r.ok) {
      const { status, message } = neonErrorPayload(r);
      return fail(res, status, message);
    }
    return ok(res, { message: 'Verification code sent.' });
  } catch (err) {
    console.error('[Auth] send-verification-otp proxy failed:', err?.message || err);
    if (err?.message?.includes('NEON_AUTH_BASE_URL')) {
      return fail(res, 503, 'Auth service is not configured. Please contact support.');
    }
    return fail(res, 500, 'Failed to send code. Please try again in a moment.');
  }
});

// POST /api/auth/email-otp/resend
router.post('/email-otp/resend', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'A valid email is required.');

  try {
    const r = await neonFetch('/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    if (!r.ok) {
      const { status, message } = neonErrorPayload(r);
      return fail(res, status, message);
    }
    return ok(res, { message: 'Verification code resent.' });
  } catch (err) {
    console.error('[Auth] resend proxy failed:', err?.message || err);
    return fail(res, 500, 'Failed to resend code. Please try again in a moment.');
  }
});

// POST /api/auth/sign-in/email-otp
// Proxies to Neon Auth: `POST /auth/sign-in/email-otp`.
// On success, mints a local session row in the project's own `sessions` table
// so the rest of the app keeps working with the existing Bearer-token flow.
router.post('/sign-in/email-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || '').trim();
  if (!EMAIL_RE.test(email) || !otp) {
    return fail(res, 400, 'Email and code are required.');
  }

  let neonResponse;
  try {
    neonResponse = await neonFetch('/auth/sign-in/email-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  } catch (err) {
    console.error('[Auth] sign-in/email-otp proxy failed:', err?.message || err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }

  if (!neonResponse.ok) {
    const { status, message } = neonErrorPayload(neonResponse);
    return fail(res, status, message);
  }

  const body = neonResponse.data || {};
  const neonUser = body.user || body?.data?.user;
  if (!neonUser?.email) {
    return fail(res, 500, 'Authentication response was incomplete.');
  }

  const localUser = await findOrCreateUserByEmail({ email: neonUser.email });
  const { token, expiresAt } = await mintLocalSession({ user: localUser, req });

  return res.json({
    success: true,
    session: { id: token, token, userId: localUser.id, expiresAt },
    user: shapeUser(localUser),
  });
});

// GET /api/auth/session  — kept for the React client's existing getSession() call.
router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  const userId = await validateSession(token);
  if (!userId) return res.json({ session: null, user: null });

  const result = await query(
    'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified FROM users WHERE id::TEXT = $1::TEXT',
    [userId]
  );
  if (result.rows.length === 0) return res.json({ session: null, user: null });

  const u = result.rows[0];
  return res.json({
    session: { id: token, token, userId: u.id },
    user: shapeUser(u),
  });
});

// POST /api/auth/signout
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try { await deleteSession(token); } catch { }
  res.json({ success: true });
});

// POST /api/auth/update-username
router.post('/update-username', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return fail(res, 401, 'Session token missing');

    const { username } = req.body || {};
    const trimmed = (username || '').trim();
    if (!USERNAME_RE.test(trimmed)) {
      return fail(res, 400, 'Username must be 2-20 characters.');
    }

    const userId = await validateSession(token);
    if (!userId) return fail(res, 401, 'Session expired.');

    const check = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id::TEXT != $2::TEXT',
      [trimmed, userId]
    );
    if (check.rows.length > 0) return fail(res, 400, 'Username taken.');

    const result = await query(
      'UPDATE users SET username = $1 WHERE id::TEXT = $2::TEXT RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email',
      [trimmed, userId]
    );

    if (result.rows.length === 0) return fail(res, 404, 'User not found.');

    const u = result.rows[0];
    return ok(res, { user: shapeUser(u) });
  } catch (error) {
    console.error('[Auth] update-username error:', error);
    return fail(res, 500, 'Update failed.');
  }
});

export default router;
