import crypto from 'crypto';
import { query } from './db/query.js';

const OTP_EXPIRY_MINUTES = 15;
const SESSION_DAYS = 30;

/**
 * Generates a 6-digit OTP, stores it in the verifications table, and returns it.
 * Any existing OTP for this email is replaced.
 */
export async function generateAndStoreOtp(email) {
  const otp = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const id = crypto.randomUUID();

  await query('DELETE FROM verifications WHERE identifier = $1', [email]);
  await query(
    'INSERT INTO verifications (id, identifier, value, expires_at) VALUES ($1, $2, $3, $4)',
    [id, email, otp, expiresAt]
  );

  return otp;
}

/**
 * Validates an OTP for a given email.
 * Deletes the record on success (one-time use) or expiry.
 * Returns true if valid, false otherwise.
 */
export async function validateOtp(email, otp) {
  const result = await query(
    'SELECT value, expires_at FROM verifications WHERE identifier = $1',
    [email]
  );

  if (result.rows.length === 0) return false;

  const { value: storedOtp, expires_at: expiresAt } = result.rows[0];

  if (new Date() > new Date(expiresAt)) {
    await query('DELETE FROM verifications WHERE identifier = $1', [email]);
    return false;
  }

  if (storedOtp !== otp) return false;

  // Consume the OTP — it's single-use
  await query('DELETE FROM verifications WHERE identifier = $1', [email]);
  return true;
}

/**
 * Sends an OTP email via Resend.
 * If RESEND_API_KEY is not set, logs the code to the console for development.
 */
export async function sendOtpEmail({ to, otp }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n[Auth] ============ OTP CODE (dev — no email sent) ============');
    console.log(`[Auth] Email : ${to}`);
    console.log(`[Auth] Code  : ${otp}`);
    console.log('[Auth] Set RESEND_API_KEY + EMAIL_FROM to send real emails.');
    console.log('[Auth] =======================================================\n');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to: [to],
      subject: '♟ Your Chess sign-in code',
      text: `Your sign-in code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 16px">♟ Chess Sign-In</h2>
          <p style="margin:0 0 8px;color:#444">Your sign-in code:</p>
          <p style="font-size:36px;font-weight:700;letter-spacing:10px;color:#111;margin:0 0 16px">${otp}</p>
          <p style="color:#666;font-size:14px;margin:0 0 8px">Expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p style="color:#999;font-size:12px;margin:0">If you didn't request this, you can safely ignore this email.</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${err}`);
  }
}

/**
 * Creates a 30-day session for a user. Returns the opaque session token.
 */
export async function createSession(userId, { ipAddress, userAgent } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, token, expiresAt, ipAddress ?? null, userAgent ?? null]
  );

  return token;
}

/**
 * Validates a Bearer session token.
 * Returns the user_id if valid, null if missing/expired/invalid.
 */
export async function validateSession(token) {
  if (!token) return null;

  const result = await query(
    'SELECT user_id, expires_at FROM sessions WHERE token = $1',
    [token]
  );

  if (result.rows.length === 0) return null;

  const { user_id, expires_at } = result.rows[0];

  if (new Date() > new Date(expires_at)) {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }

  return user_id;
}

/**
 * Deletes a session by token (sign out). Silent no-op if token is missing.
 */
export async function deleteSession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}
