import crypto from 'node:crypto';
import { query } from './db.js';
import { validateSession } from './auth.js';

const POLLINATIONS_ISSUER = 'https://enter.pollinations.ai';
const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_BUDGET = process.env.POLLINATIONS_COACH_BUDGET || '5';
const DEFAULT_EXPIRY_DAYS = process.env.POLLINATIONS_COACH_EXPIRY_DAYS || '7';
const DEFAULT_COACH_MODEL = process.env.COACH_MODEL || 'openai-fast';
const FREE_COACH_MODEL = process.env.COACH_FREE_MODEL || 'openai-fast';

function getAuthorizedCoachModels() {
  const configuredModels = (process.env.POLLINATIONS_COACH_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([...(configuredModels.length ? configuredModels : [DEFAULT_COACH_MODEL]), FREE_COACH_MODEL])].join(',');
}

function getClientId() {
  return process.env.POLLINATIONS_CLIENT_ID || process.env.POLLINATIONS_APP_KEY || '';
}

function getEncryptionKey() {
  const raw = process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET || '';
  if (!raw) throw new Error('POLLINATIONS_TOKEN_ENCRYPTION_KEY is not configured.');
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptToken(payload) {
  const [ivRaw, tagRaw, ciphertextRaw] = String(payload).split('.');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted coach token.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  if (forwardedHost) return `${forwardedProto || 'https'}://${forwardedHost}`;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return `${req.protocol || 'http'}://${req.get('host')}`;
}

export function coachAppRedirect(req, suffix = '') {
  const appUrl = (process.env.APP_URL || getRequestOrigin(req)).replace(/\/$/, '');
  return `${appUrl}/play${suffix}`;
}

function getRedirectUri(req) {
  return (process.env.POLLINATIONS_REDIRECT_URI || `${getRequestOrigin(req)}/api/coach/callback`).replace(/\/$/, '');
}

async function discover() {
  const response = await fetch(`${POLLINATIONS_ISSUER}/.well-known/oauth-authorization-server`);
  if (!response.ok) throw new Error(`Pollinations OAuth discovery failed (${response.status}).`);
  return response.json();
}

export function coachConfigurationStatus() {
  return Boolean(getClientId() && (process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET));
}

export async function authenticatedUserId(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return validateSession(authorization.slice(7));
}

export async function createAuthorizationUrl(req) {
  const clientId = getClientId();
  if (!clientId) return { error: 'Pollinations BYOP is not configured. Set POLLINATIONS_CLIENT_ID.' };
  const userId = await authenticatedUserId(req);
  if (!userId) return { error: 'Log in before connecting the AI coach.' };
  if (!coachConfigurationStatus()) return { error: 'Pollinations coach encryption is not configured on the server.' };

  const metadata = await discover();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = getRedirectUri(req);

  await query('DELETE FROM pollinations_oauth_states WHERE expires_at < NOW()');
  await query(
    'INSERT INTO pollinations_oauth_states (state, user_id, code_verifier, redirect_uri, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [state, userId, verifier, redirectUri, new Date(Date.now() + STATE_TTL_MS)]
  );

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', 'profile usage');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('models', getAuthorizedCoachModels());
  authorizationUrl.searchParams.set('budget', DEFAULT_BUDGET);
  authorizationUrl.searchParams.set('expiry', DEFAULT_EXPIRY_DAYS);
  return { authorizationUrl: authorizationUrl.toString() };
}

export async function completeAuthorization(code, state) {
  if (!code || !state) throw new Error('Pollinations authorization callback is missing code or state.');
  const result = await query(
    'DELETE FROM pollinations_oauth_states WHERE state = $1 AND expires_at > NOW() RETURNING user_id, code_verifier, redirect_uri',
    [state]
  );
  const login = result.rows[0];
  if (!login) throw new Error('Pollinations authorization state is invalid, expired, or already used.');

  const metadata = await discover();
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: getClientId(),
      redirect_uri: login.redirect_uri,
      code_verifier: login.code_verifier,
    }),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) throw new Error(`Pollinations token exchange failed (${response.status}).`);

  const expiresIn = Number(token.expires_in) > 0 ? Number(token.expires_in) * 1000 : 7 * 24 * 60 * 60 * 1000;
  await query(
    `INSERT INTO pollinations_coach_tokens (user_id, encrypted_token, expires_at, scope, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET encrypted_token = EXCLUDED.encrypted_token, expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = CURRENT_TIMESTAMP`,
    [login.user_id, encryptToken(token.access_token), new Date(Date.now() + expiresIn), token.scope || null]
  );
  return login.user_id;
}

export async function getCoachToken(userId) {
  if (!userId) return null;
  const result = await query('SELECT encrypted_token, expires_at FROM pollinations_coach_tokens WHERE user_id = $1 LIMIT 1', [userId]);
  const row = result.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await query('DELETE FROM pollinations_coach_tokens WHERE user_id = $1', [userId]);
    return null;
  }
  try {
    return decryptToken(row.encrypted_token);
  } catch (error) {
    console.error('[Coach] Failed to decrypt Pollinations token:', error.message);
    await query('DELETE FROM pollinations_coach_tokens WHERE user_id = $1', [userId]);
    return null;
  }
}

export async function disconnectCoach(userId) {
  await query('DELETE FROM pollinations_coach_tokens WHERE user_id = $1', [userId]);
}
