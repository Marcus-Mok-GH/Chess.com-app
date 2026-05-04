const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function authRequest(path, body) {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
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
