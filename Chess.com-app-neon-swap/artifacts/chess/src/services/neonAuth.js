/**
 * Native email-OTP auth client backed by Neon Auth.
 *
 * The app delegates email-OTP sign-in to Neon's hosted auth (Better Auth
 * under the hood). This file is a thin wrapper over `@neondatabase/neon-js`
 * that preserves the call signature the React context expects:
 *
 *   neonAuth.emailOtp.sendVerificationOtp({ email })
 *   neonAuth.signIn.emailOtp({ email, otp })
 *   neonAuth.getSession()
 *   neonAuth.signOut()
 *
 * Neon Auth stores its session in a cookie on its own auth domain. The
 * browser includes those cookies automatically when `credentials: 'include'`
 * is set, but the Express server cannot read them directly (cross-site
 * cookie). So the React client also forwards the access token in an
 * `Authorization: Bearer <jwt>` header on every server call. We use the
 * SDK to read the token off the session object.
 *
 * All public methods return: { success, data, error } so callers can use
 * a single pattern.
 */

import { createAuthClient } from '@neondatabase/neon-js/auth';

const neonAuthBaseUrl = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3001';

const authUrl = (import.meta.env?.VITE_NEON_AUTH_URL || '').trim();

const authClient = createAuthClient({
  ...(authUrl ? { url: authUrl } : {}),
});

const SESSION_TOKEN_KEY = 'chess_user_token';

function getLocalToken() {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

function setLocalToken(token) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {}
}

function asErrorMessage(err, fallback) {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  try { return JSON.stringify(err); } catch { return fallback; }
}

async function postJson(path, body) {
  const token = getLocalToken();
  let res;
  try {
    res = await fetch(`${neonAuthBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body ?? {}),
    });
  } catch (err) {
    return { success: false, data: null, error: asErrorMessage(err, 'Network error') };
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = data?.error?.message || data?.message || `Request failed (${res.status})`;
    return { success: false, data, error: message };
  }
  return { success: true, data, error: null };
}

async function getJson(path) {
  const token = getLocalToken();
  try {
    const res = await fetch(`${neonAuthBaseUrl}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({ session: null, user: null }));
    return { success: res.ok, data, error: null };
  } catch (err) {
    return { success: false, data: { session: null, user: null }, error: asErrorMessage(err, 'Network error') };
  }
}

function extractTokenFromSession(session) {
  if (!session) return null;
  return session.access_token || session.accessToken || session.token || session.session_token || null;
}

function pickUser(session) {
  if (!session) return null;
  return session.user || session?.data?.user || null;
}

export const neonAuth = {
  emailOtp: {
    sendVerificationOtp: async ({ email }) => {
      try {
        const { error } = await authClient.auth.emailOtp.sendVerificationOtp({
          email,
          type: 'sign-in',
        });
        if (error) {
          return { success: false, data: null, error: asErrorMessage(error, 'Failed to send code') };
        }
        return { success: true, data: { sent: true }, error: null };
      } catch (err) {
        return { success: false, data: null, error: asErrorMessage(err, 'Failed to send code') };
      }
    },
    resendVerificationOtp: async ({ email }) => {
      try {
        const { error } = await authClient.auth.emailOtp.sendVerificationOtp({
          email,
          type: 'sign-in',
        });
        if (error) {
          return { success: false, data: null, error: asErrorMessage(error, 'Failed to resend code') };
        }
        return { success: true, data: { sent: true }, error: null };
      } catch (err) {
        return { success: false, data: null, error: asErrorMessage(err, 'Failed to resend code') };
      }
    },
  },
  signIn: {
    emailOtp: async ({ email, otp }) => {
      try {
        const { data, error } = await authClient.auth.signIn.emailOtp({ email, otp });
        if (error) {
          return { success: false, data: null, error: asErrorMessage(error, 'Invalid or expired code') };
        }
        const session = data?.session || data;
        const token = extractTokenFromSession(session);
        if (token) setLocalToken(token);

        // After Neon creates the session, fetch our merged profile so the
        // context gets the full user row (elo, username, needsUsername, …).
        const sessionRes = await getJson('/api/auth/session');
        return {
          success: true,
          data: {
            ...(data || {}),
            session: sessionRes.data?.session,
            user: sessionRes.data?.user,
            token,
          },
          error: null,
        };
      } catch (err) {
        return { success: false, data: null, error: asErrorMessage(err, 'Invalid or expired code') };
      }
    },
  },
  getSession: async () => {
    // First check the SDK so the cookie is refreshed automatically.
    try {
      const sdkSession = await authClient.auth.getSession();
      const data = sdkSession?.data ?? sdkSession;
      const session = data?.session || null;
      const token = extractTokenFromSession(session);
      if (token) setLocalToken(token);
    } catch {
      // ignore — fall through to server-side lookup
    }
    return getJson('/api/auth/session');
  },
  signOut: async () => {
    setLocalToken(null);
    try {
      await authClient.auth.signOut();
    } catch {
      // Even if the remote signOut fails, the local state is cleared.
    }
    return postJson('/api/auth/signout', {});
  },
};

// Re-export the client so other modules can use it directly.
export { authClient };

export default neonAuth;
