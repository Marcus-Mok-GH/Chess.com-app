import { createAuthClient } from '@neondatabase/auth';

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

if (!neonAuthUrl) {
  throw new Error('[Neon Auth] VITE_NEON_AUTH_URL is required but not configured. Please set it in your .env file.');
}

console.log('[Neon Auth] Client initialized with URL:', neonAuthUrl);

export const neonAuth = createAuthClient(neonAuthUrl);
