import crypto from 'crypto';
import { query } from './db/query.js';

const SESSION_DAYS = 30;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a 30-day session for a user. Returns the opaque session token.
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
