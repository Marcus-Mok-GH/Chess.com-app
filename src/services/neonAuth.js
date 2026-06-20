/**
 * Neon Auth client (powered by Better Auth with email OTP).
 *
 * Requires NEON_AUTH_URL (server-side env var) — get it from your Neon project dashboard:
 *   Neon Console → your project → Auth tab → copy the Auth URL.
 * Then add it to your .env:
 *   NEON_AUTH_URL=https://<your-neon-auth-url>
 *
 * The client routes requests through the Express backend (/api/auth/*) instead
 * of calling Neon directly. This prevents "Invalid origin" errors caused by
 * Better Auth's CSRF check rejecting cross-origin browser requests.
 */
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

// Route auth calls through the same origin as the app (proxied by Express to Neon).
// In dev: http://localhost:5173 → Vite proxy → Express → Neon
// In prod: https://your-app.com → Express serverless fn → Neon
const neonAuthBaseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3001';

const noOpStub = {
  emailOtp: {
    sendVerificationOtp: async () => ({ data: null, error: new Error('Auth proxy not configured — set NEON_AUTH_URL on the server') }),
  },
  signIn: {
    emailOtp: async () => ({ data: null, error: new Error('Auth proxy not configured — set NEON_AUTH_URL on the server') }),
  },
  getSession: async () => ({ data: { session: null, user: null } }),
  signOut: async () => {},
};

let neonAuth;
try {
  neonAuth = createAuthClient({
    baseURL: neonAuthBaseUrl,
    plugins: [emailOTPClient()],
  });
} catch (err) {
  console.error('[Neon Auth] Failed to initialise auth client:', err.message);
  neonAuth = noOpStub;
}

export { neonAuth };
