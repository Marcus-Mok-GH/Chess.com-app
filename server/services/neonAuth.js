import { createAuth } from '@neondatabase/auth/server';
import { Pool } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';

// Use the pooled connection for auth operations
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: true } : false,
});

export const neonAuth = createAuth({
  db: pool,
  emailOtp: {
    sendVerificationOtp: async ({ email, otp }) => {
      // In a real app, you would use an email provider like Resend or SendGrid
      console.log(`[NeonAuth] Sending OTP ${otp} to ${email}`);
    },
  },
});
