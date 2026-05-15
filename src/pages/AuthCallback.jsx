import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './AuthCallback.css';

export default function AuthCallback() {
  const { completeMagicLinkSignIn, isLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Guard against double-fire: useEffect re-runs when completeMagicLinkSignIn
  // reference changes after login() sets user state.
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Wait for UserContext initial session restore to finish before proceeding.
    if (isLoading) return;
    // Prevent double execution.
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const tokenHash = searchParams.get('token_hash');
    const requestId = searchParams.get('requestId');
    const magicType = searchParams.get('type') || 'magiclink';

    // Also check URL hash fragment (used by Supabase implicit flow)
    let hashToken = null;
    let hashRefreshToken = null;
    let hashType = null;

    if (window.location.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      hashToken = hashParams.get('token') || hashParams.get('access_token');
      hashRefreshToken = hashParams.get('refresh_token');
      hashType = hashParams.get('type');
    }

    const hasCallbackParams = code || token || tokenHash || hashToken;
    if (!hasCallbackParams) {
      navigate('/login', { replace: true });
      return;
    }

    const callbackType = hashType || magicType;
    const normalizedType =
      callbackType === 'magiclink' || callbackType === 'email'
        ? 'magiclink'
        : callbackType;

    const pendingData = (() => {
      try {
        const raw = localStorage.getItem('chess_pending_magic_link');
        return raw ? JSON.parse(raw) : null;
      } catch {
        localStorage.removeItem('chess_pending_magic_link');
        return null;
      }
    })();

    const username =
      searchParams.get('username') ||
      pendingData?.username ||
      pendingData?.user_metadata?.username ||
      '';
    const email = searchParams.get('email') || pendingData?.email || '';

    // Clean up pending storage before async work
    localStorage.removeItem('chess_pending_magic_link');
    if (requestId) {
      localStorage.removeItem('chess_auth_request_id');
    }

    (async () => {
      const result = await completeMagicLinkSignIn({
        username,
        email,
        token: token || undefined,
        tokenHash: tokenHash || undefined,
        accessToken: hashToken || undefined,
        refreshToken: hashRefreshToken || undefined,
        type: normalizedType,
        code: code || undefined,
        requestId: requestId || undefined,
      });

      if (result?.success) {
        // Strip auth tokens from the URL before navigating away
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate('/home', { replace: true });
      } else {
        console.error('[AuthCallback] Sign-in failed:', result?.error);
        navigate(
          `/login?error=${encodeURIComponent(result?.error || 'Magic link sign in failed')}`,
          { replace: true }
        );
      }
    })();
  }, [completeMagicLinkSignIn, isLoading, navigate, searchParams]);

  return (
    <div className="auth-callback">
      <div className="spinner"></div>
      <p>Processing your login...</p>
    </div>
  );
}
