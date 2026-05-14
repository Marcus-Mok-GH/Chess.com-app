<<<<<<< HEAD
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { RootState } from '../store';
import './AuthCallback.css';

export const AuthCallback = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setLoading(true);

        // Get session from Supabase
        const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Failed to retrieve session');
          setLoading(false);
          return;
        }

        if (!session?.user) {
          setError('No active session found');
          setLoading(false);
          return;
        }

        // Get user details to populate state
        const { data: { user: profile }, error: userError } = await window.supabase.auth.getUser();

        if (userError) {
          console.error('User details error:', userError);
          setError('Failed to fetch user details');
          setLoading(false);
          return;
        }

        // Update Redux auth state
        dispatch(authenticateUser({
          user: profile,
          session,
        }));

        // Navigate to home or dashboard
        navigate('/home', { replace: true });
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('An unknown error occurred during authentication');
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [dispatch, navigate]);

  if (loading) {
    return (
      <div className="auth-callback">
        <div className="auth-callback-content">
          <div className="spinner"></div>
          <p>Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-callback auth-callback-error">
        <div className="auth-callback-content">
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// Optional: If you want to keep the Navbar while processing
// Remove if you want a full-screen loading state
=======
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './AuthCallback.css';

export default function AuthCallback() {
  const { completeMagicLinkSignIn, isLoading } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (isLoading) return;

    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const tokenHash = searchParams.get('token_hash');
    const requestId = searchParams.get('requestId');
    const magicType = searchParams.get('type') || 'magiclink';

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
    const normalizedType = (callbackType === 'magiclink' || callbackType === 'email')
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

    const username = searchParams.get('username') || pendingData?.username || pendingData?.user_metadata?.username || '';
    const email = searchParams.get('email') || pendingData?.email || '';

    // Clean up pending data
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
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate('/home', { replace: true });
      } else {
        alert(result?.error || 'Magic link sign in failed. Please try again.');
        navigate('/login', { replace: true });
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
>>>>>>> 7563ec7 (feat: replace Play with Computer and Play Online with single Get Started button)
