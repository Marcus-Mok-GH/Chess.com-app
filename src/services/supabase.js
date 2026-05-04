const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function authRequest(path, body) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error?.message || '';
    if (message.includes('Load failed') || message.includes('Failed to fetch') || message.includes('NetworkError')) {
      throw new Error('Could not reach Supabase Auth. Verify VITE_SUPABASE_URL, anon key, and network/CORS settings.');
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.msg || data?.error_description || data?.error || 'Supabase auth failed');
  }

  return data;
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: null } };
    },
    async signInWithOtp({ email, data: metadata }) {
      try {
        const data = await authRequest('otp', {
          email,
          create_user: true,
          data: metadata || {},
        });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async verifyOtp({ email, token }) {
      try {
        const data = await authRequest('verify', {
          email,
          token,
          type: 'email',
        });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async signOut() {
      return { error: null };
    },
  },
};
