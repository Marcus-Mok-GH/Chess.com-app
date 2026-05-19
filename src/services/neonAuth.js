/**
 * Neon Auth client (powered by Stack Auth).
 *
 * Requires VITE_NEON_AUTH_URL — get it from your Neon project dashboard:
 *   Neon Console → your project → Auth tab → copy the Auth URL.
 * Then add it to your .env:
 *   VITE_NEON_AUTH_URL=https://<your-neon-auth-url>
 */
import { createAuthClient } from '@neondatabase/auth';

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

const noOpStub = {
  emailOtp: {
    sendVerificationOtp: async () => ({ data: null, error: new Error('Neon Auth not configured — set VITE_NEON_AUTH_URL') }),
  },
  signIn: {
    emailOtp: async () => ({ data: null, error: new Error('Neon Auth not configured — set VITE_NEON_AUTH_URL') }),
  },
  getSession: async () => ({ data: { session: null, user: null } }),
  signOut: async () => {},
};

let neonAuth;
if (!neonAuthUrl) {
  console.error(
    '[Neon Auth] VITE_NEON_AUTH_URL is not set.\n' +
    'Go to Neon Console → your project → Auth tab → copy the Auth URL\n' +
    'and add it to your .env as VITE_NEON_AUTH_URL=<url>'
  );
  neonAuth = noOpStub;
} else {
  try {
    neonAuth = createAuthClient(neonAuthUrl);
  } catch (err) {
    console.error('[Neon Auth] Failed to initialise auth client:', err.message);
    neonAuth = noOpStub;
  }
}

export { neonAuth };
