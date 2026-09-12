import crypto from 'crypto';
import { query } from './db/query.js';

const SESSION_DAYS = 7;
export const SESSION_COOKIE_NAME = 'chess_session';

function getCookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key !== name) continue;
    try { return decodeURIComponent(valueParts.join('=')); } catch { return valueParts.join('='); }
  }
  return null;
}

export function getSessionTokenFromHeaders(headers = {}) {
  const authorization = headers.authorization || headers.Authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim() || null;
  }
  return getCookieValue(headers.cookie, SESSION_COOKIE_NAME);
}

export function getSessionToken(req) {
  return getSessionTokenFromHeaders(req?.headers || {});
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function requireSession(req, res, next) {
  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ error: { message: 'Authentication required.' } });
  try {
    const userId = await validateSession(token);
    if (!userId) return res.status(401).json({ error: { message: 'Session expired.' } });
    req.userId = String(userId);
    next();
  } catch (error) {
    console.error('[Auth] session middleware failed:', error?.message || error);
    return res.status(503).json({ error: { message: 'Session store temporarily unavailable.' } });
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a 7-day sliding-window session for a user. Returns the opaque session token.
 */
export async function createSession(userId, { ipAddress, userAgent } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, tokenHash, expiresAt, ipAddress ?? null, userAgent ?? null]
  );

  return token;
}

/**
 * Validates a Bearer session token.
 * Returns the user_id if valid, null if missing/expired/invalid.
 */
export async function validateSession(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await query(
    'SELECT user_id, expires_at FROM sessions WHERE token = $1',
    [tokenHash]
  );

  if (result.rows.length === 0) return null;

  const { user_id, expires_at } = result.rows[0];

  if (new Date() > new Date(expires_at)) {
    await query('DELETE FROM sessions WHERE token = $1', [tokenHash]);
    return null;
  }

  await query(
    'UPDATE sessions SET expires_at = $1 WHERE token = $2',
    [new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000), tokenHash]
  );

  return user_id;
}

/**
 * Deletes a session by token (sign out). Silent no-op if token is missing.
 */
export async function deleteSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await query('DELETE FROM sessions WHERE token = $1', [tokenHash]);
}
