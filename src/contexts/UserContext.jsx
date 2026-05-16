import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { supabase } from '../services/supabase';
import socket from '../services/socket';

const SESSION_USER_KEY = 'chess_user_session';
const SESSION_USER_DATA_KEY = 'chess_user_data';
const PENDING_OTP_KEY = 'chess_pending_otp';
const AUTH_REQUEST_ID_KEY = 'chess_auth_request_id';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const persistUser = useCallback((userData) => {
    if (!userData?.username) return;
    localStorage.setItem(SESSION_USER_KEY, userData.username);
    localStorage.setItem(SESSION_USER_DATA_KEY, JSON.stringify(userData));
  }, []);

  // Handle socket re-connection for pending auth requests
  useEffect(() => {
    const requestId = localStorage.getItem(AUTH_REQUEST_ID_KEY);
    if (requestId) {
      console.log('[UserContext] Re-joining auth room for pending request:', requestId);
      socket.joinAuthRoom(requestId);
    }
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('[UserContext] App is now online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[UserContext] App is now offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for remote login success
  useEffect(() => {
    const handleRemoteLogin = async ({ session, userData }) => {
      console.log('📱 REMOTE LOGIN SUCCESS RECEIVED');

      try {
        if (supabase.auth.setSession) {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        }

        setUser(userData);
        persistUser(userData);
        localStorage.setItem(SESSION_USER_KEY, userData.username);
        localStorage.removeItem(AUTH_REQUEST_ID_KEY);
        localStorage.removeItem(PENDING_OTP_KEY);
        console.log('✅ REMOTE SESSION ESTABLISHED:', userData.username);
      } catch (err) {
        console.error('🔴 FAILED TO ESTABLISH REMOTE SESSION:', err);
      }
    };

    socket.on('remote_login_success', handleRemoteLogin);
    return () => socket.off('remote_login_success', handleRemoteLogin);
  }, [persistUser]);

  // Load user session on mount and handle auth state changes
  useEffect(() => {
    let isMounted = true;

    async function init() {
      let sessionUser = null;
      let sessionUsername = '';

      try {
        const sessionUserRaw = localStorage.getItem(SESSION_USER_DATA_KEY);
        if (sessionUserRaw) {
          try {
            sessionUser = JSON.parse(sessionUserRaw);
            if (sessionUser?.username && isMounted) {
              setUser(sessionUser);
              console.log('✅ SESSION RESTORED (local):', sessionUser.username);
            }
          } catch (error) {
            console.warn('[UserContext] Invalid local session data. Clearing.');
            localStorage.removeItem(SESSION_USER_DATA_KEY);
          }
        }
        sessionUsername = sessionUser?.username || localStorage.getItem(SESSION_USER_KEY) || '';
      } catch (e) {
        console.error('🔴 SESSION LOAD ERROR:', e.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          console.log('[UserContext] No Supabase session found');
          if (isMounted) {
            setUser(null);
            localStorage.removeItem(SESSION_USER_KEY);
            localStorage.removeItem(SESSION_USER_DATA_KEY);
          }
          return;
        }

        if (!sessionUsername && session.user?.user_metadata?.username) {
          sessionUsername = session.user.user_metadata.username;
        }

        if (!sessionUsername) {
          console.warn('[UserContext] Supabase session exists but no username found');
          return;
        }

        console.log('[UserContext] Found session for:', sessionUsername);
        const loginResult = await login({ username: sessionUsername });

        if (!isMounted) return;

        if (loginResult.success) {
          console.log('✅ SESSION RESTORED (server):', loginResult.userData.username);
        } else {
          console.error('🔴 SESSION SYNC FAILED:', loginResult.error);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('🔴 SESSION RESTORE FAILED:', error.message);

        const isNotFound = error.message.includes('User not found') || error.message.includes('404');
        if (isNotFound) {
          setUser(null);
          localStorage.removeItem(SESSION_USER_KEY);
          localStorage.removeItem(SESSION_USER_DATA_KEY);
        }
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[UserContext] Auth event: ${event}`);
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem(SESSION_USER_KEY);
        localStorage.removeItem(SESSION_USER_DATA_KEY);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session && !user) {
          const username = session.user?.user_metadata?.username;
          if (username) {
            login({ username }).catch(err => {
              console.error('[UserContext] Failed to sync user after sign-in event', err);
            });
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [persistUser]);

  const login = useCallback(async ({ username }) => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername || trimmedUsername.length < 2) {
      return { error: 'Username must be at least 2 characters' };
    }
    if (trimmedUsername.length > 20) {
      return { error: 'Username must be 20 characters or less' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return { error: 'Username can only contain letters, numbers, and underscores' };
    }

    if (!navigator.onLine) {
      const error = new Error('[Database Error] You must be online to sign in');
      console.error('🔴 LOGIN FAILED:', error.message);
      return { error: 'You must be online to sign in' };
    }

    try {
      console.log('[UserContext] Logging in with username:', trimmedUsername);
      const response = await api.login(trimmedUsername);
      console.log('✅ LOGIN SUCCESSFUL:', response.user.username);

      const userData = {
        id: response.user.id,
        username: response.user.username,
        elo: response.user.elo,
        gamesPlayed: response.user.gamesPlayed,
        wins: response.user.wins,
        losses: response.user.losses,
        draws: response.user.draws,
        createdAt: response.user.createdAt,
      };

      persistUser(userData);
      setUser(userData);
      return { success: true, isNewUser: response.isNewUser, userData };
    } catch (error) {
      console.error('🔴 LOGIN FAILED:', error.message);
      return { error: error.message || 'Failed to sign in. Please try again.' };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_USER_DATA_KEY);
    setUser(null);
    console.log('[UserContext] Logged out');
  }, []);

  /**
   * Step 1 of OTP login: send a sign-in link to the user's email.
   * The link redirects to /auth/callback where the session is established.
   */
  const requestOtp = useCallback(async ({ email, username }) => {
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();

    if (!trimmedEmail) return { error: 'Email is required' };
    if (!trimmedUsername || trimmedUsername.length < 2) {
      return { error: 'Username must be at least 2 characters' };
    }
    if (!navigator.onLine) return { error: 'You must be online to request a code' };

    try {
      localStorage.setItem(PENDING_OTP_KEY, JSON.stringify({
        username: trimmedUsername,
        email: trimmedEmail,
      }));

      if (!supabase?.auth?.signInWithOtp) {
        throw new Error('Supabase Auth is not available. Please check your environment variables.');
      }

      const result = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { username: trimmedUsername },
        },
      });

      if (result.error) throw result.error;

      return {
        success: true,
        message: 'Check your email for a sign-in link.',
      };
    } catch (error) {
      console.error('🔴 OTP REQUEST FAILED:', error);
      localStorage.removeItem(PENDING_OTP_KEY);
      return { error: error.message || 'Failed to send verification code.' };
    }
  }, []);

  /**
   * Step 2 of OTP login: verify the 6-digit code (used when Supabase
   * project is configured to send codes instead of magic links).
   */
  const verifyEmailOtp = useCallback(async ({ email, token }) => {
    if (!email || !token) return { error: 'Email and verification code are required' };
    if (!navigator.onLine) return { error: 'You must be online to verify' };

    const pendingData = (() => {
      try {
        const raw = localStorage.getItem(PENDING_OTP_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        localStorage.removeItem(PENDING_OTP_KEY);
        return null;
      }
    })();

    try {
      if (!supabase?.auth?.verifyOtp) {
        throw new Error('Supabase verifyOtp is not available.');
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email',
      });

      if (error) throw error;

      const resolvedUsername =
        pendingData?.username?.trim() ||
        data?.user?.user_metadata?.username ||
        '';

      if (!resolvedUsername) {
        return { error: 'Could not resolve username. Please start over.' };
      }

      localStorage.removeItem(PENDING_OTP_KEY);
      localStorage.removeItem(AUTH_REQUEST_ID_KEY);

      const loginResult = await login({ username: resolvedUsername });
      return loginResult;
    } catch (error) {
      console.error('🔴 OTP VERIFICATION FAILED:', error);
      return { error: error.message || 'Invalid or expired code. Please try again.' };
    }
  }, [login]);

  /** @deprecated Use requestOtp instead. */
  const requestMagicLink = requestOtp;

  const updateElo = useCallback(async (opponentElo, gameResult) => {
    if (!user) return;
    if (!navigator.onLine) {
      const error = new Error('[Database Error] Cannot update ELO while offline');
      console.error('🔴 ELO UPDATE FAILED:', error.message);
      throw error;
    }
    try {
      console.log('[UserContext] Updating ELO for:', user.username);
      const response = await api.updateElo(user.username, opponentElo, gameResult);
      const updatedUser = {
        ...user,
        elo: response.newElo,
        gamesPlayed: response.gamesPlayed,
        wins: response.wins,
        losses: response.losses,
        draws: response.draws,
      };
      setUser(updatedUser);
      persistUser(updatedUser);
      console.log('✅ ELO UPDATED:', response.previousElo, '→', response.newElo);
      return {
        previousElo: response.previousElo,
        newElo: response.newElo,
        eloChange: response.change,
      };
    } catch (error) {
      console.error('🔴 ELO UPDATE FAILED:', error.message);
      throw error;
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    if (!navigator.onLine) {
      const error = new Error('[Database Error] Cannot refresh user while offline');
      console.error('🔴 USER REFRESH FAILED:', error.message);
      return;
    }
    try {
      console.log('[UserContext] Refreshing user data for:', user.username);
      const serverUser = await api.getUser(user.username);
      const refreshedUser = {
        id: serverUser.id,
        username: serverUser.username,
        elo: serverUser.elo,
        gamesPlayed: serverUser.gamesPlayed,
        wins: serverUser.wins,
        losses: serverUser.losses,
        draws: serverUser.draws,
        createdAt: serverUser.createdAt,
      };
      setUser(refreshedUser);
      persistUser(refreshedUser);
      console.log('✅ USER REFRESHED:', refreshedUser.username);
    } catch (error) {
      console.error('🔴 USER REFRESH FAILED:', error.message);
    }
  }, [user]);

  const value = {
    user,
    isLoggedIn: !!user,
    isLoading,
    isOnline,
    login,
    requestOtp,
    verifyEmailOtp,
    requestMagicLink, // deprecated alias
    logout,
    updateElo,
    refreshUser,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export default UserContext;
