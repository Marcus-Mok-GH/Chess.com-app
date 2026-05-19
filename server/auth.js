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
      // For now, we log the OTP to the console so it can be retrieved from server logs.
      console.log(`
========================================
[AUTH] OTP VERIFICATION CODE
To: ${email}
Code: ${otp}
Type: ${type}
========================================
      `);
    },
  },
  // BETTER_AUTH_SECRET is required. We use a fallback only for development safety.
  secret: process.env.BETTER_AUTH_SECRET || 'development-secret-key-1234567890',
  // The base URL for the auth endpoints.
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/auth` : 'http://localhost:3001/api/auth'),
  // Allow these origins to make cross-origin requests to the auth API.
  trustedOrigins: [
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'http://localhost:5173',
  ].filter(Boolean),
});
