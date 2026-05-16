/**
 * AuthCallback.jsx
 *
 * Handles Supabase magic link redirects. After the user clicks the sign-in
 * link in their email, Supabase redirects here with a code or token in the URL.
 * We exchange it for a session, then log the user into the app.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useUser } from '../contexts/UserContext';
import './AuthCallback.css';

const PENDING_OTP_KEY = 'chess_pending_otp';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useUser();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    async function handleCallback() {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = window.location.hash
        ? new URLSearchParams(window.location.hash.slice(1))
        : null;

      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      const accessToken = hashParams?.get('access_token');
      const refreshToken = hashParams?.get('refresh_token');

      // No recognisable auth params — nothing to do
      if (!code && !tokenHash && !accessToken) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        let authUser = null;

        if (code) {
          // PKCE flow (modern Supabase default)
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          authUser = data.user;
        } else if (tokenHash) {
          // Token-hash flow — 'magiclink' and 'signup' are deprecated; normalize to 'email'
          const normalizedType = (type === 'magiclink' || type === 'signup' || !type) ? 'email' : type;
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: normalizedType,
          });
          if (error) throw error;
          authUser = data.user;
        } else if (accessToken && refreshToken) {
          // Implicit / hash-fragment flow (older Supabase)
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          authUser = data.user;
        }

        // Resolve username — prefer the value stored before the link was sent,
        // fall back to what Supabase recorded in user_metadata.
        let username = '';
        try {
          const pendingRaw = localStorage.getItem(PENDING_OTP_KEY);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            username = pending.username || '';
          }
        } catch (_) {}

        if (!username) {
          username = authUser?.user_metadata?.username || '';
        }

        if (!username) {
          throw new Error('Could not determine username. Please try signing in again.');
        }

        localStorage.removeItem(PENDING_OTP_KEY);

        const loginResult = await login({ username });
        if (loginResult?.error) throw new Error(loginResult.error);

        navigate('/home', { replace: true });
      } catch (err) {
        console.error('[AuthCallback] Sign-in failed:', err);
        navigate(
          '/login?error=' + encodeURIComponent(err.message || 'Sign-in failed. Please try again.'),
          { replace: true }
        );
      }
    }

    handleCallback();
  }, [navigate, login]);

  return (
    <div className="auth-callback">
      <div className="spinner"></div>
      <p>Signing you in…</p>
    </div>
  );
}
