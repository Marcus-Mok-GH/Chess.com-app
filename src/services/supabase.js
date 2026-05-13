import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseUrl = rawUrl.trim();
const supabaseAnonKey = rawKey.trim();

const isMock = !supabaseUrl || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined';

if (isMock) {
  console.warn('[Supabase] Credentials missing or invalid. Using mock client.');
  if (typeof window !== 'undefined') {
    console.warn('[Supabase] VITE_SUPABASE_URL:', supabaseUrl ? 'Set (but maybe "undefined")' : 'Missing');
    console.warn('[Supabase] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set (but maybe "undefined")' : 'Missing');
  }
} else {
  console.log('[Supabase] Client initialized with URL:', supabaseUrl);
}

const mockAuth = {
  onAuthStateChange: () => ({
    data: { subscription: { unsubscribe: () => { console.log('[Supabase Mock] Unsubscribed'); } } }
  }),
  getSession: async () => {
    console.warn('[Supabase Mock] getSession called');
    return { data: { session: null }, error: null };
  },
  getUser: async () => {
    console.warn('[Supabase Mock] getUser called');
    return { data: { user: null }, error: null };
  },
  signInWithOtp: async () => {
    console.error('[Supabase Mock] signInWithOtp called - No credentials configured');
    return { error: new Error('Supabase configuration missing. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
  },
  verifyOtp: async () => {
    console.error('[Supabase Mock] verifyOtp called - No credentials configured');
    return { error: new Error('Supabase configuration missing.') };
  },
  exchangeCodeForSession: async () => {
    console.error('[Supabase Mock] exchangeCodeForSession called - No credentials configured');
    return { error: new Error('Supabase configuration missing.') };
  },
  setSession: async () => {
    console.error('[Supabase Mock] setSession called - No credentials configured');
    return { error: new Error('Supabase configuration missing.') };
  },
  signOut: async () => {
    console.warn('[Supabase Mock] signOut called');
    return { error: null };
  }
};

export const supabase = !isMock
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: false,  // We handle code exchange manually
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : { auth: mockAuth };
