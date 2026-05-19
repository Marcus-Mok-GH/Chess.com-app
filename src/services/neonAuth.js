import { createAuthClient } from '@neondatabase/auth';

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL || import.meta.env.NEON_AUTH_BASE_URL || '';

const isMock = !neonAuthUrl || neonAuthUrl === 'undefined';

if (isMock) {
  console.warn('[Neon Auth] URL missing or invalid. Using mock client.');
} else {
  console.log('[Neon Auth] Client initialized with URL:', neonAuthUrl);
}

const mockAuth = {
  emailOtp: {
    sendVerificationOtp: async () => {
      console.error('[Neon Auth Mock] emailOtp.sendVerificationOtp called - No URL configured');
      return { error: { message: 'Neon Auth configuration missing. Please check VITE_NEON_AUTH_URL.' } };
    }
  },
  signIn: {
    emailOtp: async () => {
      console.error('[Neon Auth Mock] signIn.emailOtp called - No URL configured');
      return { error: { message: 'Neon Auth configuration missing.' } };
    }
  },
  signOut: async () => {
    console.warn('[Neon Auth Mock] signOut called');
    return { error: null };
  },
  getSession: async () => {
    console.warn('[Neon Auth Mock] getSession called');
    return { data: { session: null }, error: null };
  }
};

export const neonAuth = !isMock
  ? createAuthClient(neonAuthUrl)
  : mockAuth;
