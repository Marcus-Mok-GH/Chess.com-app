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