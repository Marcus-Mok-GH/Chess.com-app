/**
 * Neon Auth server instance (powered by Better Auth with email OTP).
 *
 * Required environment variables:
 *   NEON_AUTH_BASE_URL — copy from Neon Console → your project → Auth tab.
 *   DATABASE_URL       — pooled Neon/Postgres connection string.
 *
 * Neon Auth includes a built-in shared SMTP provider, so OTP emails are
 * delivered automatically when NEON_AUTH_BASE_URL is configured — no
 * external email service required.
 */
import { createAuth } from '@neondatabase/auth/server';
import { getPool } from '../db/pool.js';

const pool = getPool();

export const neonAuth = createAuth({
  db: pool,
  // Do NOT override emailOtp.sendVerificationOtp here.
  // Omitting it lets Neon Auth use its built-in SMTP provider.
  // If you ever want a custom sender (e.g. Resend, SendGrid),
  // add it here: emailOtp: { sendVerificationOtp: async ({ email, otp }) => { ... } }
});
