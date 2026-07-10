/**
 * Email-OTP auth client.
 *
 * The React client still owns the request/response shape (`{ success, data, error }`)
 * for backwards compatibility with the rest of the app, but the OTP itself
 * is now sent by Neon Auth (Better Auth email-OTP) rather than by a
 * custom mailer. The Express backend at `/api/auth/*` proxies the calls
 * to Neon, then issues our own session token once the code is verified.
 *
 * Endpoints:
 *   POST /api/auth/email-otp/send-verification-otp
 *   POST /api/auth/email-otp/resend
 *   POST /api/auth/sign-in/email-otp
 *   GET  /api/auth/session
 *   POST /api/auth/signout
 *
 * All public methods return: { success, data, error }.
 *   - success === true  → data holds the response body
 *   - success === false → error is a string explaining what went wrong
 */

const neonAuthBaseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3001';

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(`${neonAuthBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { success: false, data: null, error: err?.message || 'Network error' };
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = data?.error?.message || data?.message || `Request failed (${res.status})`;
    return { success: false, data, error: message };
  }
  return { success: true, data, error: null };
}

async function getJson(path, token) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${neonAuthBaseUrl}${path}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({ session: null, user: null }));
    return { success: res.ok, data, error: null };
  } catch (err) {
    return { success: false, data: { session: null, user: null }, error: err?.message || 'Network error' };
  }
}

export const neonAuth = {
  emailOtp: {
    sendVerificationOtp: ({ email }) =>
      postJson('/api/auth/email-otp/send-verification-otp', { email }),
    resendVerificationOtp: ({ email }) =>
      postJson('/api/auth/email-otp/resend', { email }),
  },
  signIn: {
    emailOtp: ({ email, otp }) =>
      postJson('/api/auth/sign-in/email-otp', { email, otp }),
  },
  getSession: async ({ token } = {}) => getJson('/api/auth/session', token),
  signOut: async ({ token } = {}) => {
    const result = await postJson('/api/auth/signout', { token });
    return { success: true, data: { success: true }, error: result.error };
  },
};

export default neonAuth;
