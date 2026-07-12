/**
 * /api/auth/* router — local email-OTP flow.
 *
 * This file is a self-contained, dependency-free auth router. It generates
 * 6-digit codes, stores them in the project's own `verifications` table,
 * dispatches the email via a pluggable transport (Resend → SMTP → console),
 * and mints a local session on successful sign-in.
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
 * The previous Neon Auth proxy was removed because the upstream
 * `emailOTP` route was 404'ing in production, surfacing to users as
 * "Auth service unavailable". This local flow removes that dependency.
 */

import express from 'express';
import crypto from 'crypto';
import { timingSafeEqual } from 'node:crypto';

import { query } from '../db/query.js';
import {
  createSession,
  deleteSession,
  validateSession,
} from '../auth.js';
import { sendOtpEmail } from '../mailer.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,20}$/;

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DAYS = 7;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function hashCode(code, salt) {
  try {
    if (!salt) throw new Error('invalid salt');
    const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt), 'hex');
    return crypto.scryptSync(String(code), saltBuf, 32).toString('hex');
  } catch {
    return '';
  }
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function ok(res, data) {
  return res.json({ success: true, ...data });
}

function fail(res, status, message) {
  return res.status(status).json({ error: { message } });
}

async function findActiveVerification(identifier) {
  const result = await query(
    `SELECT id, code_hash, salt, expires_at, attempts, created_at
       FROM verifications
      WHERE identifier = $1 AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [identifier]
  );
  return result.rows[0] || null;
}

async function invalidatePrevious(identifier) {
  await query(
    `UPDATE verifications SET consumed_at = NOW()
      WHERE identifier = $1 AND consumed_at IS NULL`,
    [identifier]
  );
}

async function findOrCreateUserByEmail(email) {
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

async function sendOtp({ email, resend }) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, status: 400, message: 'A valid email is required.' };
  }

  // Cooldown: only consider non-consumed, non-expired codes so users who
  // already verified aren't locked out.
  try {
    const recent = await query(
      `SELECT created_at FROM verifications
        WHERE identifier = $1 AND consumed_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [normalized]
    );
    if (recent.rows[0]) {
      const lastCreated = new Date(recent.rows[0].created_at).getTime();
      const elapsed = (Date.now() - lastCreated) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        return {
          ok: false,
          status: 429,
          message: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s before requesting a new code.`,
        };
      }
    }
  } catch (err) {
    console.error('[Auth] cooldown check failed (non-fatal):', err?.message || err);
  }

  const code = generateCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = hashCode(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Send email FIRST so a mailer failure doesn't leave the user with no
  // usable code (or invalidate a still-valid one).
  try {
    await sendOtpEmail({ to: normalized, code });
  } catch (err) {
    console.error('[Auth] sendOtpEmail failed:', err?.message || err);
    return {
      ok: false,
      status: 500,
      message: 'Failed to send code. Please try again in a moment.',
    };
  }

  // Invalidate any outstanding code, then store the new one.
  try {
    await invalidatePrevious(normalized);
  } catch (e) {
    console.warn('[Auth] invalidatePrevious failed (non-fatal):', e?.message);
  }

  try {
    await query(
      `INSERT INTO verifications (identifier, code_hash, salt, value, expires_at)
       VALUES ($1, $2, $3, 'native-email-otp', $4)`,
      [normalized, codeHash, salt, expiresAt]
    );
  } catch (dbErr) {
    console.error('[Auth] Failed to store OTP verification:', dbErr?.message || dbErr);
    return {
      ok: false,
      status: 500,
      message: 'Failed to store verification code. Please try again.',
    };
  }

  return { ok: true, status: 200, message: 'Verification code sent.' };
}

// POST /api/auth/email-otp/send-verification-otp
router.post('/email-otp/send-verification-otp', async (req, res) => {
  try {
    const result = await sendOtp({ email: req.body?.email, resend: false });
    if (!result.ok) return fail(res, result.status, result.message);
    return ok(res, { message: result.message });
  } catch (err) {
    console.error('[Auth] send-verification-otp handler error:', err);
    return fail(res, 500, 'Failed to process verification request.');
  }
});

// POST /api/auth/email-otp/resend
router.post('/email-otp/resend', async (req, res) => {
  try {
    const result = await sendOtp({ email: req.body?.email, resend: true });
    if (!result.ok) return fail(res, result.status, result.message);
    return ok(res, { message: result.message });
  } catch (err) {
    console.error('[Auth] resend handler error:', err);
    return fail(res, 500, 'Failed to process resend request.');
  }
});

// POST /api/auth/sign-in/email-otp
router.post('/sign-in/email-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.otp || '').trim();
  if (!EMAIL_RE.test(email) || !code) {
    return fail(res, 400, 'Email and code are required.');
  }

  let verification;
  try {
    verification = await findActiveVerification(email);
  } catch (err) {
    console.error('[Auth] findActiveVerification failed:', err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }
  if (!verification) {
    return fail(res, 400, 'Your code has expired or was never issued. Please request a new one.');
  }

  if (verification.attempts >= OTP_MAX_ATTEMPTS) {
    try { await invalidatePrevious(email); } catch { /* noop */ }
    return fail(res, 429, 'Too many incorrect attempts. Please request a new code.');
  }

  const expectedHash = verification.code_hash;
  const candidateHash = hashCode(code, verification.salt);
  let matches = false;
  if (expectedHash && candidateHash && expectedHash.length === candidateHash.length) {
    try {
      const expBuf = Buffer.from(String(expectedHash), 'hex');
      const candBuf = Buffer.from(String(candidateHash), 'hex');
      if (expBuf.length === candBuf.length && expBuf.length === 32) {
        matches = timingSafeEqual(expBuf, candBuf);
      }
    } catch {
      matches = false;
    }
  }

  if (!matches) {
    try {
      await query(
        'UPDATE verifications SET attempts = attempts + 1 WHERE id = $1',
        [verification.id]
      );
    } catch { /* noop */ }
    const remaining = OTP_MAX_ATTEMPTS - (verification.attempts + 1);
    const tail = remaining > 0
      ? `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      : 'Please request a new code.';
    return fail(res, 400, `Incorrect code. ${tail}`);
  }

  // Mark consumed, find/create the user, mint a local session.
  try {
    await query(
      'UPDATE verifications SET consumed_at = NOW() WHERE id = $1',
      [verification.id]
    );
  } catch (err) {
    console.error('[Auth] Failed to mark verification consumed:', err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }

  let user;
  try {
    user = await findOrCreateUserByEmail(email);
  } catch (err) {
    console.error('[Auth] findOrCreateUserByEmail failed:', err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }

  let token;
  try {
    token = await createSession(user.id, {
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });
  } catch (err) {
    console.error('[Auth] createSession failed:', err);
    return fail(res, 500, 'Verification failed. Please try again.');
  }

  return res.json({
    success: true,
    session: {
      id: token,
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    },
    user: shapeUser(user),
  });
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
