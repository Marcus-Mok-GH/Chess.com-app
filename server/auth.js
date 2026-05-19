import { betterAuth } from 'better-auth';
import { getPool } from './db/pool.js';

/**
 * Better Auth configuration for the server.
 * Uses the existing database pool and provides Email OTP functionality.
 */
export const auth = betterAuth({
  database: {
    db: getPool(),
    type: 'postgres',
    schema: {
      user: 'users',
      session: 'sessions',
      account: 'accounts',
      verification: 'verifications',
    }
  },
  emailOtp: {
    enabled: true,
    sendVerificationOtp: async ({ email, otp, type }) => {
      // In a real production app, you would integrate with an email service like Resend, SendGrid, or AWS SES.
      // For development/testing purposes, log only non-PII metadata
      console.log('[AUTH] Verification email dispatched', { type, timestamp: new Date().toISOString() });

      // TODO: Integrate with actual email service (e.g., Resend, SendGrid, AWS SES)
      // Example integration:
      // await emailService.send({
      //   to: email,
      //   subject: 'Your verification code',
      //   text: `Your verification code is: ${otp}`
      // });
    },
  },
  // BETTER_AUTH_SECRET is required. In production, we must fail fast if it's missing.
  secret: (() => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new Error('BETTER_AUTH_SECRET environment variable is required in production. Please set it to a secure random string.');
    }
    return secret || 'development-secret-key-1234567890';
  })(),
  // The base URL for the auth endpoints.
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/auth` : 'http://localhost:3001/api/auth'),
  // Allow these origins to make cross-origin requests to the auth API.
  trustedOrigins: [
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'http://localhost:5173',
  ].filter(Boolean),
});
