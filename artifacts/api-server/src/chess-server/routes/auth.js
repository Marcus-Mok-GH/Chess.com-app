import express from 'express';
import crypto from 'crypto';
import { query } from '../db/query.js';
import {
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';

const router = express.Router();

const EMAIL_RE = /^[\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Robust proxy to Neon/Better Auth
 */
async function proxyToAuth(req, path, body) {
  const neonAuthUrl = getNeonAuthUrl();
  if (!neonAuthUrl) throw new Error('Auth service not configured.');

  const upstreamUrl = `${neonAuthUrl}${path}`;
  const headers = {
    'content-type': 'application/json',
    'accept': 'application/json',
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
    'x-forwarded-for': req.headers['x-forwarded-for'] || req.ip,
  };

  // Carefully forward existing session/state cookies
  if (req.headers.cookie) headers['cookie'] = req.headers.cookie;

  // Forward origin but prioritize the incoming origin for CSRF consistency
  if (req.headers.origin) headers['origin'] = req.headers.origin;
  else headers['origin'] = `https://${req.headers.host}`;

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get('set-cookie');
  const status = response.status;
  const data = await response.json().catch(() => ({}));

  return { status, data, setCookies };
}

router.post('/email-otp/send-verification-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: { message: 'A valid email is required.' } });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Failsafe 1: Try 'sign-in' type (Unified flow)
    let result = await proxyToAuth(req, '/email-otp/send-verification-otp', {
      email: normalizedEmail,
      type: 'sign-in'
    });

    // Failsafe 2: If 400, try 'email-verification' type (Classic flow)
    if (result.status === 400) {
      console.log(`[Auth] 'sign-in' failed for ${normalizedEmail}, retrying with 'email-verification'...`);
      result = await proxyToAuth(req, '/email-otp/send-verification-otp', {
        email: normalizedEmail,
        type: 'email-verification'
      });
    }

    // Forward cookies
    if (result.setCookies) {
      const cookies = Array.isArray(result.setCookies) ? result.setCookies : [result.setCookies];
      cookies.forEach(c => res.append('set-cookie', c));
    }

    return res.status(result.status).json(result.data);
  } catch (err) {
    console.error('[Auth] Send OTP Error:', err);
    return res.status(500).json({ error: { message: 'Auth bridge failure: ' + err.message } });
  }
});

router.post('/sign-in/email-otp', async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: { message: 'Email and code are required.' } });

  try {
    const result = await proxyToAuth(req, '/sign-in/email-otp', {
      email: email.toLowerCase().trim(),
      otp: otp.trim()
    });

    if (result.setCookies) {
      const cookies = Array.isArray(result.setCookies) ? result.setCookies : [result.setCookies];
      cookies.forEach(c => res.append('set-cookie', c));
    }

    if (result.status >= 400) {
      return res.status(result.status).json(result.data);
    }

    // Auth succeeded at Neon, now handle local user record
    const normalizedEmail = email.toLowerCase().trim();
    let user;
    const existing = await query(`SELECT id, username, elo, games_played, wins, losses, draws, created_at, email FROM users WHERE email = $1`, [normalizedEmail]);

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

    const token = await createSession(user.id, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    const needsUsername = user.username.startsWith('player_');

    return res.json({
      session: {
        id: token,
        token: token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      user: { ...user, name: user.username, needsUsername }
    });
  } catch (err) {
    console.error('[Auth] Verify OTP Error:', err);
    return res.status(500).json({ error: { message: 'Auth bridge verification failure: ' + err.message } });
  }
});

router.post('/update-username', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Session token missing' } });

  const { username } = req.body || {};
  const trimmed = (username || '').trim();

  if (trimmed.length < 2 || trimmed.length > 20 || !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return res.status(400).json({ error: { message: 'Username must be 2-20 characters.' } });
  }

  try {
    const userId = await validateSession(token);
    if (!userId) return res.status(401).json({ error: { message: 'Session expired.' } });

    const check = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id::TEXT != $2::TEXT', [trimmed, userId]);
    if (check.rows.length > 0) return res.status(400).json({ error: { message: 'Username taken.' } });

    const result = await query(
      'UPDATE users SET username = $1 WHERE id::TEXT = $2::TEXT RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email',
      [trimmed, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: { message: 'User not found.' } });

    const u = result.rows[0];
    return res.json({ success: true, user: { ...u, name: u.username, needsUsername: false } });
  } catch (error) {
    return res.status(500).json({ error: { message: 'Update failed.' } });
  }
});

async function resolveUniqueUsername(base) {
  const check = await query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [base]);
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base.slice(0, 15)}_${suffix}`;
}

router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });

    const result = await query('SELECT id, username, email, elo, games_played, wins, losses, draws, created_at FROM users WHERE id::TEXT = $1::TEXT', [userId]);
    if (result.rows.length === 0) return res.json({ session: null, user: null });

    const u = result.rows[0];
    const needsUsername = u.username.startsWith('player_');

    return res.json({
      session: { id: token, token: token, userId: u.id },
      user: { ...u, name: u.username, needsUsername }
    });
  } catch (error) {
    return res.json({ session: null, user: null });
  }
});

router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try { await deleteSession(token); } catch { }
  res.json({ success: true });
});

export default router;
