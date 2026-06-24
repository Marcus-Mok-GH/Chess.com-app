import express from 'express';
import crypto from 'crypto';
import { query } from '../db/query.js';
import {
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';

const router = express.Router();

/**
 * Returns the normalized Neon Auth base URL.
 * Neon's Vercel integration injects NEON_AUTH_BASE_URL automatically when
 * Auth is enabled on the project (Neon Console → project → Auth tab).
 *
 * Tolerates values with or without a trailing /api/auth or trailing slash,
 * since different Neon/Vercel configurations have shipped both.
 */
function getNeonAuthUrl() {
  const raw = process.env.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_URL;
  if (!raw) return null;
  let url = raw.trim().replace(/\/+$/, '');
  // Strip a duplicated sub-path if the env var was set to include it.
  url = url.replace(/\/(api\/auth|email-otp\/send-verification-otp|sign-in\/email-otp)\/?$/i, '');
  return url;
}

// POST /api/auth/email-otp/send-verification-otp
// Proxies to Neon Auth — Neon generates the OTP and delivers the email natively.
// No SMTP configuration required; Neon's built-in mail provider handles delivery.
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: { message: 'Email is required.' } });
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

  const upstreamUrl = `${neonAuthUrl}/email-otp/send-verification-otp`;
  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: req.headers.origin || `https://${req.headers.host}`,
      },
      body: JSON.stringify({ email: email.toLowerCase().trim(), type: 'sign-in' }),
    });

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!response.ok) {
      console.error(
        `[Auth] send-otp upstream ${response.status} for ${email} → ${upstreamUrl}`,
        { status: response.status, body: data }
      );
      return res.status(response.status).json(data);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[Auth] send-otp error:', err, { upstreamUrl });
    return res.status(500).json({ error: { message: 'Failed to send code. Please try again.' } });
  }
});

// POST /api/auth/sign-in/email-otp
// Proxies the OTP check to Neon Auth. On success, upserts the user in the local
// DB and issues a local session token (keeping the rest of the app's session
// validation unchanged).
router.post('/sign-in/email-otp', async (req, res) => {
  const { email, otp, name } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: { message: 'Email and code are required.' } });
  }

  const neonAuthUrl = getNeonAuthUrl();
  if (!neonAuthUrl) {
    console.error('[Auth] NEON_AUTH_BASE_URL is not set');
    return res.status(503).json({
      error: { message: 'Auth service is not configured. Set NEON_AUTH_BASE_URL.' },
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const upstreamUrl = `${neonAuthUrl}/sign-in/email-otp`;
  try {
    // Step 1 — verify the OTP with Neon Auth
    const neonResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: req.headers.origin || `https://${req.headers.host}`,
      },
      body: JSON.stringify({ email: normalizedEmail, otp }),
    });

    const text = await neonResponse.text();
    let neonData;
    try { neonData = text ? JSON.parse(text) : {}; } catch { neonData = { raw: text }; }

    if (!neonResponse.ok || neonData.error) {
      console.error(
        `[Auth] sign-in/email-otp upstream ${neonResponse.status} for ${normalizedEmail} → ${upstreamUrl}`,
        { status: neonResponse.status, body: neonData }
      );
      // Forward Neon's error response verbatim so the client sees the real reason
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
    console.error('[Auth] sign-in/email-otp error:', err);
    return res.status(500).json({ error: { message: 'Sign-in failed. Please try again.' } });
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
    console.error('[Auth] session error:', error);
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
