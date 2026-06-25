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
// Vercel injects these system env vars automatically (no manual setup needed):
//   VERCEL_URL                    — per-commit preview URL (changes every deploy)
//   VERCEL_BRANCH_URL             — per-branch URL (stable across commits on the same branch)
//   VERCEL_PROJECT_PRODUCTION_URL — stable production URL (e.g. chess-com-app.vercel.app)
// None of them include a protocol prefix, so we add https:// manually.
const trustedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  // Local dev
  'http://localhost:5173',
  'http://localhost:3001',
].filter(Boolean);

// Warn at startup if there is no durable production origin in the list.
// In that case every request from the live app would fail the CSRF check, which
// is very hard to diagnose. localhost entries don't count as "production".
const hasDurableProductionOrigin =
  process.env.FRONTEND_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_BRANCH_URL;

if (!hasDurableProductionOrigin && process.env.NODE_ENV !== 'development') {
  console.warn(
    '[NeonAuth] No durable production origin configured. ' +
    'Set FRONTEND_URL (or rely on Vercel system vars VERCEL_PROJECT_PRODUCTION_URL / ' +
    'VERCEL_BRANCH_URL) so that Better Auth accepts requests from your live domain. ' +
    'Auth will only work on localhost and the current ephemeral deployment URL.',
  );
}

export const neonAuth = createAuth({
  db: pool,
  trustedOrigins,
  // Do NOT override emailOtp.sendVerificationOtp here.
  // Omitting it lets Neon Auth use its built-in SMTP provider.
  // If you ever want a custom sender (e.g. Resend, SendGrid),
  // add it here: emailOtp: { sendVerificationOtp: async ({ email, otp }) => { ... } }
});
