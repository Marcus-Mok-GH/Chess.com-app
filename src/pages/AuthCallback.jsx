/**
 * AuthCallback.jsx
 *
 * Previously handled Supabase magic link redirects.
 * Since the app now uses email OTP (6-digit codes), there is no redirect
 * after sign-in — verification happens inline on the login modal.
 *
 * Kept in place to:
 *   1. Avoid broken routes for any in-flight magic links sent before the migration.
 *   2. Provide a fallback for potential future OAuth providers.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthCallback.css';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hasParams = searchParams.has('code') || searchParams.has('token') || searchParams.has('token_hash');
    const hashParams = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null;
    const hasHashParams = hashParams && (hashParams.has('access_token') || hashParams.has('token'));

    if (!hasParams && !hasHashParams) {
      navigate('/login', { replace: true });
      return;
    }

    // Legacy magic link — inform the user and redirect to login
    navigate(
      '/login?error=' + encodeURIComponent('Magic links are no longer supported. Please use your email to receive a 6-digit code instead.'),
      { replace: true }
    );
  }, [navigate]);

  return (
    <div className="auth-callback">
      <div className="spinner"></div>
      <p>Redirecting...</p>
    </div>
  );
}
