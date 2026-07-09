/**
 * Server-side Neon Auth integration.
 *
 * The React client delegates email-OTP sign-in to Neon's hosted auth
 * service. After sign-in, the SDK stores the session in cookies on the
 * Neon auth host and exposes the JWT via `session.access_token`. Our
 * Express server never sees the Neon auth cookie directly (cross-site),
 * so the React client forwards the access token in an
 * `Authorization: Bearer <jwt>` header on every `/api/auth/*` call.
 *
 * This module:
 *   - verifies the JWT against Neon's JWKS public keys
 *   - looks up (or creates) the corresponding row in our `users` table,
 *     keyed by Neon's `sub` claim (= the neon_auth.user.id)
 *   - exposes a single helper `verifyRequest(req)` returning the merged
 *     app user + the decoded session payload
 */

import crypto from 'crypto';
import { query } from './db/query.js';

const authBaseUrl = (process.env.NEON_AUTH_BASE_URL || '').trim().replace(/\/$/, '');

const JWKS_CACHE_MS = 10 * 60 * 1000;
let jwksCache = { keys: null, fetchedAt: 0 };

function jwksUrl() {
  if (!authBaseUrl) return null;
  return `${authBaseUrl}/.well-known/jwks.json`;
}

async function loadJwks() {
  const url = jwksUrl();
  if (!url) return [];
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      console.error('[NeonAuth] JWKS fetch failed:', res.status);
      return [];
    }
    const body = await res.json();
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    jwksCache = { keys, fetchedAt: Date.now() };
    return keys;
  } catch (err) {
    console.error('[NeonAuth] JWKS fetch error:', err.message);
    return [];
  }
}

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

async function verifyJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = (() => { try { return JSON.parse(base64UrlDecode(headerB64)); } catch { return null; } })();
  if (!header?.kid || !header?.alg) return null;

  const keys = await loadJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const keyObj = crypto.createPublicKey({
      key: jwk,
      format: 'jwk',
    });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const ok = verifier.verify(keyObj, Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    if (!ok) return null;
  } catch (err) {
    console.error('[NeonAuth] JWT verify error:', err.message);
    return null;
  }

  let payload;
  try { payload = JSON.parse(base64UrlDecode(payloadB64)); } catch { return null; }
  if (!payload?.sub) return null;
  if (payload.exp && Date.now() / 1000 > Number(payload.exp)) return null;
  return payload;
}

function extractBearer(req) {
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  if (req.body?.token) return String(req.body.token).trim();
  return null;
}

function generateBaseUsername(email) {
  const local = String(email || '').split('@')[0] || 'player';
  const clean = local.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'player';
  return `${clean}_${crypto.randomBytes(2).toString('hex')}`;
}

async function resolveUniqueUsername(base) {
  const check = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [base]
  );
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base.slice(0, 15)}_${suffix}`;
}

export async function findOrCreateAppUser(neonUser) {
  if (!neonUser?.id) return null;
  const existing = await query(
    `SELECT id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified
       FROM users
      WHERE id = $1
         OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
      LIMIT 1`,
    [neonUser.id, neonUser.email || '']
  );
  if (existing.rows[0]) {
    // If the row was originally created by the legacy OTP flow (different id)
    // and we now have a Neon id, migrate it so future lookups match.
    if (existing.rows[0].id !== neonUser.id) {
      const migrated = await query(
        `UPDATE users SET id = $1, email_verified = COALESCE($2, email_verified)
          WHERE id = $3
          RETURNING id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified`,
        [neonUser.id, !!neonUser.emailVerified, existing.rows[0].id]
      );
      if (migrated.rows[0]) return migrated.rows[0];
    }
    return existing.rows[0];
  }

  const base = generateBaseUsername(neonUser.email || neonUser.id);
  const username = await resolveUniqueUsername(base);
  try {
    const inserted = await query(
      `INSERT INTO users (id, username, email, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified`,
      [neonUser.id, username, neonUser.email || null, !!neonUser.emailVerified]
    );
    return inserted.rows[0];
  } catch (err) {
    if (err?.code === '23505') {
      const retry = await query(
        `SELECT id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified
           FROM users
          WHERE id = $1
             OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
          LIMIT 1`,
        [neonUser.id, neonUser.email || '']
      );
      if (retry.rows[0]) return retry.rows[0];
    }
    throw err;
  }
}

export async function loadAppUser(userId) {
  if (!userId) return null;
  const result = await query(
    `SELECT id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified
       FROM users WHERE id = $1::TEXT`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Resolve the caller from a request. Returns
 *   { user, session: { id, token, expiresAt } } | null
 */
export async function verifyRequest(req) {
  if (!authBaseUrl) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[NeonAuth] NEON_AUTH_BASE_URL is not set; protected endpoints will reject all callers.');
    }
    return null;
  }

  const token = extractBearer(req);
  if (!token) return null;

  const payload = await verifyJwt(token);
  if (!payload) return null;

  const neonUser = {
    id: payload.sub,
    email: payload.email || null,
    name: payload.name || null,
    emailVerified: !!payload.email_verified || !!payload.emailVerified,
  };

  const appUser = await findOrCreateAppUser(neonUser);
  if (!appUser) return null;

  return {
    user: appUser,
    session: {
      id: token,
      token,
      userId: appUser.id,
      expiresAt: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
    },
  };
}
