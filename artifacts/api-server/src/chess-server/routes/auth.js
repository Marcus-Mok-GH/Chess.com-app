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
 */
function getNeonAuthUrl() {
  const raw =
    process.env.NEON_AUTH_BASE_URL ||
    process.env.NEON_AUTH_URL ||
    process.env.AUTH_BASE_URL ||
    process.env.AUTH_URL ||
    process.env.STACK_AUTH_URL ||
    process.env.NEON_API_BASE_URL ||
    process.env.DATABASE_AUTH_URL ||
    process.env.NEXT_PUBLIC_NEON_AUTH_URL;
  if (!raw) return null;

  let url = raw.trim().replace(/\/+$/, '');
  const tailRe = /\/(api\/auth|email-otp\/send-verification-otp|sign-in\/email-otp)\/?$/i;

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
        message: 'Auth service is not configured. Set NEON_AUTH_BASE_URL.',
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
      console.error(`[Auth] send-otp upstream ${response.status} (${maskEmail(normalizedEmail)})`);
      return res.status(response.status).json(data);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error(`[Auth] send-otp ${timedOut ? 'timeout' : 'error'} (${maskEmail(normalizedEmail)})`);
    return res.status(timedOut ? 504 : 500).json({
      error: { message: timedOut ? 'Auth provider timed out. Please try again.' : 'Failed to send code. Please try again.' },
    });
  }
});

// POST /api/auth/sign-in/email-otp
router.post('/sign-in/email-otp', async (req, res) => {
  const { email, otp } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: { message: 'A valid email is required.' } });
  }
  if (typeof otp !== 'string' || !OTP_RE.test(otp.trim())) {
    return res.status(400).json({ error: { message: 'A valid code is required.' } });
  }

  const neonAuthUrl = getNeonAuthUrl();
  if (!neonAuthUrl) {
    return res.status(503).json({ error: { message: 'Auth service is not configured.' } });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedOtp = otp.trim();
  const upstreamUrl = `${neonAuthUrl}/sign-in/email-otp`;

  try {
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
      return res.status(neonResponse.status).json(neonData);
    }

    let user;
    const existing = await query(
      `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const baseUsername = `player_${crypto.randomBytes(4).toString('hex')}`;
      const finalUsername = await resolveUniqueUsername(baseUsername);
      const newUser = await query(
        `INSERT INTO users (id, username, email) VALUES (gen_random_uuid()::TEXT, $1, $2)
         RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email`,
        [finalUsername, normalizedEmail]
      );
      user = newUser.rows[0];
    }

    const token = await createSession(user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // A user "needs a username" if their current one is a default "player_..." one.
    const needsUsername = user.username.startsWith('player_');

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
          needsUsername,
        },
      },
      error: null,
    });
  } catch (err) {
    return res.status(500).json({ error: { message: 'Sign-in failed. Please try again.' } });
  }
});

// POST /api/auth/update-username
router.post('/update-username', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Unauthorized' } });

  const { username } = req.body || {};
  const trimmed = (username || '').trim();
  
  if (trimmed.length < 2 || trimmed.length > 20 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return res.status(400).json({ error: { message: 'Username must be 2-20 characters (letters, numbers, underscores).' } });
  }

  try {
    const userId = await validateSession(token);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    // Check if username is taken
    const check = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [trimmed, userId]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: { message: 'Username is already taken.' } });
    }

    const result = await query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email',
      [trimmed, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: { message: 'User not found' } });

    const u = result.rows[0];
    return res.json({
      success: true,
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
        needsUsername: false
      }
    });
  } catch (error) {
    console.error('[Auth] update-username error:', error);
    return res.status(500).json({ error: { message: 'Failed to update username' } });
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
    const needsUsername = u.username.startsWith('player_');

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
        needsUsername,
      },
    });
  } catch (error) {
    res.json({ session: null, user: null });
  }
});

// POST /api/auth/signout
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try {
    await deleteSession(token);
  } catch { }
  res.json({ success: true });
});

export default router;