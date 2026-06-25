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

// Build the list of origins that Better Auth should trust for CSRF validation.
// Better Auth derives its default trusted origin from NEON_AUTH_BASE_URL, which is
// the Neon-hosted auth service URL (e.g. https://ep-xxx.neonauth.us-east-1.aws.neon.tech).
// That domain never matches the app's actual origin (e.g. https://chess-com-app.vercel.app),
// so every request fails the CSRF check with a 403 unless we explicitly list the
// app's origin here.
//
// Vercel injects two relevant system env vars automatically (no setup needed):
//   VERCEL_URL                  — current deployment URL (changes on every preview deploy)
//   VERCEL_PROJECT_PRODUCTION_URL — stable production URL (e.g. chess-com-app.vercel.app)
// Neither includes a protocol prefix, so we add https:// manually.
const trustedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  // Local dev
  'http://localhost:5173',
  'http://localhost:3001',
].filter(Boolean);

export const neonAuth = createAuth({
  db: pool,
  trustedOrigins,
  // Do NOT override emailOtp.sendVerificationOtp here.
  // Omitting it lets Neon Auth use its built-in SMTP provider.
  // If you ever want a custom sender (e.g. Resend, SendGrid),
  // add it here: emailOtp: { sendVerificationOtp: async ({ email, otp }) => { ... } }
});
