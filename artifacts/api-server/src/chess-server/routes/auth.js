/**
 * /api/auth/* router.
 *
 * Email verification is delegated end-to-end to Neon Auth. Neon owns email
 * delivery and OTP storage; this application mints its local session only
 * after Neon verifies the sign-in code.
 *
 * Endpoints (preserved from the previous Neon Auth proxy so the React client
 * is unchanged):
 *
 *   POST /api/auth/email-otp/send-verification-otp
 *   POST /api/auth/email-otp/resend
 *   POST /api/auth/sign-in/email-otp
 *   GET  /api/auth/session
 *   POST /api/auth/signout
 *   POST /api/auth/update-username
 *
 * Neon Auth is configured by the attached Vercel Neon integration.
 */

import express from 'express';
import crypto from 'crypto';

import { query } from '../db/query.js';
import { deleteSession, validateSession } from '../auth.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,20}$/;

const SESSION_DAYS = 7;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function getNeonAuthBase() {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new Error('NEON_AUTH_BASE_URL is not configured.');
  return base.replace(/\/+$/, '');
}

async function neonFetch(pathname, init = {}) {
  const headers = {
    accept: 'application/json',
    ...(init.body ? { 'content-type': 'application/json' } : {}),
    ...(init.headers || {}),
  };
  if (process.env.NEON_AUTH_TOKEN) headers.authorization = `Bearer ${process.env.NEON_AUTH_TOKEN}`;
  const res = await fetch(`${getNeonAuthBase()}${pathname}`, { ...init, headers });
  let data = null;
  try { data = await res.json(); } catch { /* Neon returned no JSON body. */ }
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
  return { status: response.status || 500, message: body?.error?.message || body?.message || body?.code || 'Auth service request failed.' };
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

// POST /api/auth/email-otp/send-verification-otp
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'A valid email is required.');
  try {
    const r = await neonFetch('/email-otp/send-verification-otp', {
      method: 'POST', body: JSON.stringify({ email, type: 'sign-in' }),
      headers: { ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}), ...(req.headers.origin ? { origin: req.headers.origin } : {}) },
    });
    if (!r.ok) { const { status, message } = neonErrorPayload(r); return fail(res, status, message); }
    return ok(res, { message: 'Verification code sent.' });
  } catch (err) {
    console.error('[Auth] send-verification-otp proxy failed:', err?.message || err);
    return fail(res, err?.message?.includes('NEON_AUTH_BASE_URL') ? 503 : 500, err?.message?.includes('NEON_AUTH_BASE_URL') ? 'Auth service is not configured. Please contact support.' : 'Failed to send code. Please try again in a moment.');
  }
});

// POST /api/auth/email-otp/resend
router.post('/email-otp/resend', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'A valid email is required.');
  try {
    const r = await neonFetch('/email-otp/send-verification-otp', {
      method: 'POST', body: JSON.stringify({ email, type: 'sign-in' }),
      headers: { ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}), ...(req.headers.origin ? { origin: req.headers.origin } : {}) },
    });
    if (!r.ok) { const { status, message } = neonErrorPayload(r); return fail(res, status, message); }
    return ok(res, { message: 'Verification code resent.' });
  } catch (err) {
    console.error('[Auth] resend handler error:', err?.message || err);
    return fail(res, err?.message?.includes('NEON_AUTH_BASE_URL') ? 503 : 500, err?.message?.includes('NEON_AUTH_BASE_URL') ? 'Auth service is not configured. Please contact support.' : 'Failed to resend code. Please try again in a moment.');
  }
});

// POST /api/auth/sign-in/email-otp
router.post('/sign-in/email-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || '').trim();
  if (!EMAIL_RE.test(email) || !otp) {
    return fail(res, 400, 'Email and code are required.');
  }

  try {
    const neonResponse = await neonFetch('/sign-in/email-otp', {
      method: 'POST', body: JSON.stringify({ email, otp }),
      headers: { ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}), ...(req.headers.origin ? { origin: req.headers.origin } : {}) },
    });
    if (!neonResponse.ok) {
      const { status, message } = neonErrorPayload(neonResponse);
      return fail(res, status, message);
    }

    const neonUser = neonResponse.data?.user || neonResponse.data?.data?.user;
    if (!neonUser?.email) return fail(res, 500, 'Authentication response was incomplete.');
    const user = await findOrCreateUserByEmail({ email: neonUser.email });
    const { token, expiresAt } = await mintLocalSession({ user, req });
    return res.json({
      success: true,
      session: { id: token, token, userId: user.id, expiresAt },
      user: shapeUser(user),
    });
  } catch (err) {
    console.error('[Auth] sign-in/email-otp proxy failed:', err?.message || err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  const userId = await validateSession(token);
  if (!userId) return res.json({ session: null, user: null });

  try {
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
  } catch (err) {
    console.error('[Auth] session lookup failed:', err);
    return res.json({ session: null, user: null });
  }
});

// POST /api/auth/signout
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try { await deleteSession(token); } catch { /* noop */ }
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
