import express from 'express';
import crypto from 'crypto';
import { query } from '../db/query.js';
import {
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';

const router = express.Router();

// HTTP timeout for any upstream Neon Auth call. Vercel serverless functions
// have a hard execution ceiling; bound the upstream call so we don't waste it.
const UPSTREAM_TIMEOUT_MS = 8000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{4,8}$/;

// Mask an email so logs don't leak PII. Keeps the domain for debugging.
//   alice@example.com -> a***@example.com
function maskEmail(email) {
  if (typeof email !== 'string') return '<invalid>';
  const at = email.indexOf('@');
  if (at < 1) return '<invalid>';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local[0]}***${domain}`;
}

/**
 * Returns the normalized Neon Auth base URL.
 * Neon's Vercel integration injects NEON_AUTH_BASE_URL automatically when
 * Auth is enabled on the project (Neon Console → project → Auth tab).
 *
 * Tolerates values with or without any combination of trailing:
 *   /api/auth
 *   /email-otp/send-verification-otp
 *   /sign-in/email-otp
 * Different Neon/Vercel configurations have shipped all of these suffixes
 * (sometimes stacked). We strip them in a loop until none remain.
 */
function getNeonAuthUrl() {
  // Check every env var name that Vercel's Neon integration may inject.
  // The integration sets the name automatically and it can vary by project
  // configuration, so we probe all known variants in priority order.
  const raw =
    process.env.NEON_AUTH_BASE_URL ||      // primary — Neon Vercel integration
    process.env.NEON_AUTH_URL ||           // legacy alias
    process.env.AUTH_BASE_URL ||           // generic fallback
    process.env.AUTH_URL ||               // generic fallback
    process.env.STACK_AUTH_URL ||         // Stack Auth (underlying provider)
    process.env.NEON_API_BASE_URL ||      // alternative Neon naming
    process.env.DATABASE_AUTH_URL ||      // another possible Vercel injection
    process.env.NEXT_PUBLIC_NEON_AUTH_URL; // Next.js convention variant
  if (!raw) return null;

  let url = raw.trim().replace(/\/+$/, '');

  // Tail patterns to strip (case-insensitive, can stack).
  const tailRe = /\/(api\/auth|email-otp\/send-verification-otp|sign-in\/email-otp)\/?$/i;

  // Strip repeatedly until stable (handles paths like
  // ".../neondb/auth/api/auth/email-otp/send-verification-otp").
  let prev;
  do {
    prev = url;
    url = url.replace(tailRe, '');
  } while (url !== prev);

  return url;
}

async function fetchWithTimeout(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
}

// POST /api/auth/email-otp/send-verification-otp
// Proxies to Neon Auth — Neon generates the OTP and delivers the email natively.
// No SMTP configuration required; Neon's built-in mail provider handles delivery.
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: { message: 'A valid email is required.' } });
  }

  const neonAuthUrl = getNeonAuthUrl();
  if (!neonAuthUrl) {
    console.error('[Auth] NEON_AUTH_BASE_URL is not set');
    return res.status(503).json({
      error: {
        message:
          'Auth service is not configured. Add NEON_AUTH_BASE_URL to your environment variables ' +
          '(Neon Console → your project → Auth tab → copy the Auth URL).',
      },
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const upstreamUrl = `${neonAuthUrl}/email-otp/send-verification-otp`;

  try {
    const response = await fetchWithTimeout(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: req.headers.origin || `https://${req.headers.host}`,
      },
      body: JSON.stringify({ email: normalizedEmail, type: 'sign-in' }),
    });

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

    if (!response.ok) {
      console.error(
        `[Auth] send-otp upstream ${response.status} (${maskEmail(normalizedEmail)})`
      );
      return res.status(response.status).json(data);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error(
      `[Auth] send-otp ${timedOut ? 'timeout' : 'error'} (${maskEmail(normalizedEmail)})`
    );
    return res.status(timedOut ? 504 : 500).json({
      error: { message: timedOut ? 'Auth provider timed out. Please try again.' : 'Failed to send code. Please try again.' },
    });
  }
});

// POST /api/auth/sign-in/email-otp
// Proxies the OTP check to Neon Auth. On success, upserts the user in the local
// DB and issues a local session token (keeping the rest of the app's session
// validation unchanged).
router.post('/sign-in/email-otp', async (req, res) => {
  const { email, otp, name } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: { message: 'A valid email is required.' } });
  }
  if (typeof otp !== 'string' || !OTP_RE.test(otp.trim())) {
    return res.status(400).json({ error: { message: 'A valid code is required.' } });
  }

  const neonAuthUrl = getNeonAuthUrl();
  if (!neonAuthUrl) {
    console.error('[Auth] NEON_AUTH_BASE_URL is not set');
    return res.status(503).json({
      error: { message: 'Auth service is not configured. Set NEON_AUTH_BASE_URL.' },
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedOtp = otp.trim();
  const upstreamUrl = `${neonAuthUrl}/sign-in/email-otp`;

  try {
    // Step 1 — verify the OTP with Neon Auth
    const neonResponse = await fetchWithTimeout(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: req.headers.origin || `https://${req.headers.host}`,
      },
      body: JSON.stringify({ email: normalizedEmail, otp: normalizedOtp }),
    });

    const text = await neonResponse.text();
    let neonData;
    try { neonData = text ? JSON.parse(text) : {}; } catch { neonData = {}; }

    if (!neonResponse.ok || neonData.error) {
      console.error(
        `[Auth] sign-in/email-otp upstream ${neonResponse.status} (${maskEmail(normalizedEmail)})`
      );
      return res.status(neonResponse.status).json(neonData);
    }

    // Step 2 — OTP verified; upsert the user in the local DB
    let user;
    const existing = await query(
      `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const username = (name || '').trim() || `player_${crypto.randomBytes(4).toString('hex')}`;
      const safeUsername = username.slice(0, 20).replace(/[^a-zA-Z0-9_-]/g, '_');
      const finalUsername = await resolveUniqueUsername(safeUsername);
      const newUser = await query(
        `INSERT INTO users (id, username, email) VALUES (gen_random_uuid()::TEXT, $1, $2)
         RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email`,
        [finalUsername, normalizedEmail]
      );
      user = newUser.rows[0];
    }

    // Step 3 — issue a local session token
    const token = await createSession(user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      data: {
        session: { token },
        user: {
          id: user.id,
          username: user.username,
          name: user.username,
          email: user.email,
          elo: user.elo,
          gamesPlayed: user.games_played,
          wins: user.wins,
          losses: user.losses,
          draws: user.draws,
          createdAt: user.created_at,
        },
      },
      error: null,
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error(
      `[Auth] sign-in/email-otp ${timedOut ? 'timeout' : 'error'} (${maskEmail(normalizedEmail)})`
    );
    return res.status(timedOut ? 504 : 500).json({
      error: { message: timedOut ? 'Auth provider timed out. Please try again.' : 'Sign-in failed. Please try again.' },
    });
  }
});

async function resolveUniqueUsername(base) {
  const check = await query(`SELECT id FROM users WHERE username = $1`, [base]);
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  const candidate = `${base.slice(0, 16)}_${suffix}`;
  const check2 = await query(`SELECT id FROM users WHERE username = $1`, [candidate]);
  return check2.rows.length === 0 ? candidate : `player_${crypto.randomBytes(4).toString('hex')}`;
}

// GET /api/auth/get-session (better-auth client calls this endpoint)
router.get('/get-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });
  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });
    const result = await query(
      'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });
    const u = result.rows[0];
    res.json({
      session: { token },
      user: { id: u.id, username: u.username, name: u.username, email: u.email, elo: u.elo },
    });
  } catch {
    res.json({ session: null, user: null });
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });

    const result = await query(
      'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });

    const u = result.rows[0];
    res.json({
      session: { token },
      user: {
        id: u.id,
        username: u.username,
        name: u.username,
        email: u.email,
        elo: u.elo,
        gamesPlayed: u.games_played,
        wins: u.wins,
        losses: u.losses,
        draws: u.draws,
        createdAt: u.created_at,
      },
    });
  } catch (error) {
    console.error('[Auth] session error');
    res.json({ session: null, user: null });
  }
});

// POST /api/auth/signout
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try {
    await deleteSession(token);
  } catch {
    // always succeed on signout
  }
  res.json({ success: true });
});

export default router;
