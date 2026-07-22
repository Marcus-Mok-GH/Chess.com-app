/**
 * /api/auth/* router — Neon Auth proxy for email-OTP.
 *
 * OTP generation, storage, and email delivery are all handled by Neon Auth
 * (Better Auth / Stack Auth at NEON_AUTH_BASE_URL). This router proxies the
 * relevant requests and manages local sessions + user records.
 *
 * Endpoints (same shape as before — frontend is unchanged):
 *
 *   POST /api/auth/email-otp/send-verification-otp
 *   POST /api/auth/email-otp/resend
 *   POST /api/auth/sign-in/email-otp
 *   GET  /api/auth/session
 *   POST /api/auth/signout
 *   POST /api/auth/update-username
 */

import express from 'express';
import crypto from 'crypto';

import { query } from '../db/query.js';
import {
  createSession,
  deleteSession,
  validateSession,
} from '../auth.js';

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,20}$/;
const SESSION_DAYS = 7;

// ---------------------------------------------------------------------------
// Neon Auth proxy helpers
// ---------------------------------------------------------------------------

function getNeonAuthBaseUrl() {
  return process.env.NEON_AUTH_BASE_URL || '';
}

function authServiceUnavailable(res, details = '') {
  const message = 'Auth service not configured. Set NEON_AUTH_BASE_URL.' + (details ? ` Details: ${details}` : '');
  return res.status(503).json({
    error: { message },
  });
}

function extractProxyHeaders(req) {
  const headers = {};
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'];
  if (req.headers['cookie']) headers['cookie'] = req.headers['cookie'];
  return headers;
}

async function proxyToNeonAuth(path, { method = 'POST', headers = {}, body = null } = {}) {
  const baseUrl = getNeonAuthBaseUrl();
  if (!baseUrl) {
    throw new Error('NEON_AUTH_BASE_URL is not configured.');
  }
  // NEON_AUTH_BASE_URL points at the auth root (e.g. .../neondb/auth), so
  // upstream paths are Neon Auth-native (e.g. /email-otp/send-verification-otp)
  // and must NOT include the local /api/auth prefix. Strip it defensively so
  // all four call sites are correct regardless of how the caller writes them.
  const upstreamPath = path.replace(/^\/api\/auth/, '');
  const url = `${baseUrl}${upstreamPath}`;

  const opts = { method, headers: { ...headers } };
  if (body && method !== 'GET') {
    if (typeof body === 'string') {
      opts.body = body;
    } else {
      opts.body = JSON.stringify(body);
      if (!opts.headers['content-type']) {
        opts.headers['content-type'] = 'application/json';
      }
    }
  }

  const maxRetries = 3;
  const baseDelayMs = 500;
  let lastError = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    if (attempt > 0) {
      const waitTime = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Auth Proxy] Retrying connection to ${path} (attempt ${attempt}/${maxRetries}) in ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    try {
      const response = await fetch(url, opts);
      let data = null;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      // Retry only on 5xx or transient status codes
      if (!response.ok && response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${typeof data === 'object' ? JSON.stringify(data) : text}`);
        attempt++;
        continue;
      }

      return { status: response.status, ok: response.ok, data, headers: response.headers };
    } catch (err) {
      lastError = err;
      attempt++;
    }
  }

  throw lastError || new Error('Failed to connect to Neon Auth service');
}

// ---------------------------------------------------------------------------
// Local user helpers
// ---------------------------------------------------------------------------

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

async function upsertUserFromNeonAuth(neonUser) {
  const id = neonUser.id;
  const email = neonUser.email;
  const defaultUsername = `player_${crypto.randomBytes(4).toString('hex')}`;
  const username = neonUser.name || neonUser.username || defaultUsername;

  const result = await query(
    `INSERT INTO users (id, username, email, email_verified)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (id) DO UPDATE SET email_verified = TRUE
     RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email`,
    [id, username, email]
  );

  if (result.rows.length > 0) return result.rows[0];

  const existing = await query(
    `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email
     FROM users WHERE email = $1`,
    [email]
  );
  return existing.rows[0] || null;
}

function ok(res, data) {
  return res.json({ success: true, ...data });
}

function fail(res, status, message) {
  // Clean error messages from Neon Auth
  const cleanMsg = cleanErrorMessage(message);
  return res.status(status).json({ error: { message: cleanMsg } });
}

function cleanErrorMessage(message) {
  if (typeof message !== 'string') return message;
  // Remove common prefixes from Neon Auth
  return message
    .replace(/^Neon Auth error: /i, '')
    .replace(/^Auth error: /i, '')
    .trim();
}

// ---------------------------------------------------------------------------
// POST /api/auth/email-otp/send-verification-otp
// ---------------------------------------------------------------------------
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const baseUrl = getNeonAuthBaseUrl();
  if (!baseUrl) return authServiceUnavailable(res);

  try {
    const headers = extractProxyHeaders(req);
    // Neon Auth requires an explicit OTP `type`. Default to "sign-in" for the
    // login flow; allow callers to override with email-verification / forget-password.
    const incoming = req.body || {};
    const body = { ...incoming, type: incoming.type || 'sign-in' };
    const result = await proxyToNeonAuth('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers,
      body,
    });

    if (!result.ok) {
      const errMessage = result.data?.error?.message || result.data?.message || JSON.stringify(result.data);
      return fail(res, result.status, errMessage);
    }

    return res.status(result.status).json(result.data);
  } catch (err) {
    console.error('[Auth] send-verification-otp proxy error:', err?.message || err);
    return fail(res, 502, `Auth service connection failed after 3 retries: ${err?.message || err}`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/email-otp/resend
// ---------------------------------------------------------------------------
router.post('/email-otp/resend', async (req, res) => {
  const baseUrl = getNeonAuthBaseUrl();
  if (!baseUrl) return authServiceUnavailable(res);

  try {
    const headers = extractProxyHeaders(req);
    const incoming = req.body || {};
    const body = { ...incoming, type: incoming.type || 'sign-in' };
    const result = await proxyToNeonAuth('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers,
      body,
    });

    if (!result.ok) {
      const errMessage = result.data?.error?.message || result.data?.message || JSON.stringify(result.data);
      return fail(res, result.status, errMessage);
    }

    return res.status(result.status).json(result.data);
  } catch (err) {
    console.error('[Auth] resend proxy error:', err?.message || err);
    return fail(res, 502, `Auth service connection failed after 3 retries: ${err?.message || err}`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-in/email-otp
// ---------------------------------------------------------------------------
router.post('/sign-in/email-otp', async (req, res) => {
  const baseUrl = getNeonAuthBaseUrl();
  if (!baseUrl) return authServiceUnavailable(res);

  try {
    const headers = extractProxyHeaders(req);
    const result = await proxyToNeonAuth('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers,
      body: req.body,
    });

    if (!result.ok) {
      const errMessage = result.data?.error?.message || result.data?.message || JSON.stringify(result.data);
      return fail(res, result.status, errMessage);
    }

    const neonData = result.data;
    const neonUser = neonData?.user || {};
    const neonSession = neonData?.session || {};

    if (!neonUser.id && !neonUser.email) {
      console.error('[Auth] Neon Auth sign-in returned no user:', neonData);
      return fail(res, 502, 'Auth service returned an unexpected response with no user details.');
    }

    let localUser;
    try {
      localUser = await upsertUserFromNeonAuth(neonUser);
    } catch (err) {
      console.error('[Auth] upsertUserFromNeonAuth failed:', err?.message || err);
      return fail(res, 500, `Failed to sync user locally: ${err?.message || err}`);
    }

    if (!localUser) {
      return fail(res, 500, 'Failed to sync user. Please try again.');
    }

    let token;
    try {
      token = await createSession(localUser.id, {
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
    } catch (err) {
      console.error('[Auth] createSession failed:', err?.message || err);
      return fail(res, 500, `Failed to create local session: ${err?.message || err}`);
    }

    return res.json({
      success: true,
      session: {
        id: neonSession.id || token,
        token,
        userId: localUser.id,
        expiresAt: neonSession.expiresAt || new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      },
      user: shapeUser(localUser),
    });
  } catch (err) {
    console.error('[Auth] sign-in/email-otp proxy error:', err?.message || err);
    return fail(res, 502, `Auth service connection failed after 3 retries: ${err?.message || err}`);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/session
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/auth/signout
// ---------------------------------------------------------------------------
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;

  try { await deleteSession(token); } catch { /* noop */ }

  const baseUrl = getNeonAuthBaseUrl();
  if (baseUrl) {
    try {
      const headers = extractProxyHeaders(req);
      await proxyToNeonAuth('/api/auth/sign-out', { method: 'POST', headers, body: req.body });
    } catch (err) {
      console.warn('[Auth] sign-out proxy failed (non-fatal):', err?.message || err);
    }
  }

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/update-username
// ---------------------------------------------------------------------------
router.post('/update-username', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return fail(res, 401, 'Session token missing');

    const { username } = req.body || {};
    const trimmed = (username || '').trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return fail(res, 400, `Username must be 2-20 characters (yours is ${trimmed.length}).`);
    }
    if (!USERNAME_RE.test(trimmed)) {
      return fail(res, 400, 'Usernames can only contain letters, numbers, dots (.), hyphens (-), and underscores (_). No spaces, @, or special characters.');
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