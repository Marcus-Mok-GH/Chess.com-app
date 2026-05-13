import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { supabase } from '../services/supabase';
import socket from '../services/socket';

const SESSION_USER_KEY = 'chess_user_session';
const SESSION_USER_DATA_KEY = 'chess_user_data';
const PENDING_MAGIC_LINK_KEY = 'chess_pending_magic_link';
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
        localStorage.removeItem(PENDING_MAGIC_LINK_KEY);
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

      // 1. Restore local session immediately for UI responsiveness
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
        if (isMounted) {
          setIsLoading(false);
        }
      }

      // 2. Validate with Supabase and sync with server
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

        // If we have a session but no username yet, try to get it from session metadata
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
          // Don't sign out from Supabase here; it's too aggressive and may break flows
        }
      }
    }

    init();

    // Set up auth state change listener
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

    // Validation
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

      // Store username in localStorage to persist session
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

  const requestMagicLink = useCallback(async ({ email, username }) => {
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();

    if (!trimmedEmail) {
      return { error: 'Email is required' };
    }

    if (!trimmedUsername || trimmedUsername.length < 2) {
      return { error: 'Username must be at least 2 characters' };
    }

    if (!navigator.onLine) {
      return { error: 'You must be online to request a link' };
    }

    try {
      const requestId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const redirectUrl = `${window.location.origin}/login?type=magiclink&requestId=${requestId}`;

      localStorage.setItem(PENDING_MAGIC_LINK_KEY, JSON.stringify({
        username: trimmedUsername,
        email: trimmedEmail,
        requestId
      }));
      localStorage.setItem(AUTH_REQUEST_ID_KEY, requestId);

      // Connect socket and join room for this request
      await socket.joinAuthRoom(requestId);

      if (!supabase?.auth?.signInWithOtp) {
        throw new Error('Supabase Auth is not available. Please check your environment variables.');
      }

      const result = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectUrl,
          data: { username: trimmedUsername },
        },
      });

      if (result.error) {
        throw result.error;
      }
      return {
        success: true,
        message: 'Magic link sent. Check your inbox and click the link to sign in automatically.',
      };
    } catch (error) {
      console.error('🔴 MAGIC LINK REQUEST FAILED:', error);
      return { error: error.message || 'Failed to send magic link.' };
    }
  }, []);



  const completeMagicLinkSignIn = useCallback(async ({ email, username, token, tokenHash, accessToken, refreshToken, type = 'magiclink', code, requestId }) => {
    const pendingMagicLink = (() => {
      try {
        const raw = localStorage.getItem(PENDING_MAGIC_LINK_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        localStorage.removeItem(PENDING_MAGIC_LINK_KEY);
        return null;
      }
    })();

    const localRequestId = localStorage.getItem(AUTH_REQUEST_ID_KEY);
    const isRemoteLogin = requestId && requestId !== localRequestId;

    let resolvedUsername = username?.trim() || pendingMagicLink?.username?.trim() || '';
    const resolvedEmail = email?.trim() || pendingMagicLink?.email?.trim() || '';

    if (!resolvedUsername && !code && !tokenHash && !token && !accessToken) {
      // Check if we already have a session (e.g. library handled it automatically via URL hash)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { error: 'Missing username context for magic link. Please request a new link from this browser.' };
      }
    }

    try {
      if (!supabase?.auth) {
        throw new Error('Supabase Auth is not available.');
      }

      // 1. Handle different auth callback scenarios
      if (code) {
        if (!supabase.auth.exchangeCodeForSession) throw new Error('Supabase exchangeCodeForSession is missing');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        // Recover username from metadata if missing
        if (!resolvedUsername && data.user?.user_metadata?.username) {
          resolvedUsername = data.user.user_metadata.username;
        }
      } else if (accessToken && refreshToken) {
        if (!supabase.auth.setSession) throw new Error('Supabase setSession is missing');
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } else if (tokenHash) {
        if (!supabase.auth.verifyOtp) throw new Error('Supabase verifyOtp is missing');
        const { data, error } = await supabase.auth.verifyOtp({
          email: resolvedEmail || undefined,
          token_hash: tokenHash,
          type: type === 'magiclink' ? 'magiclink' : type,
        });
        if (error) throw error;
        if (!resolvedUsername && data.user?.user_metadata?.username) {
          resolvedUsername = data.user.user_metadata.username;
        }
      } else if (token) {
        if (!supabase.auth.verifyOtp) throw new Error('Supabase verifyOtp is missing');
        const { data, error } = await supabase.auth.verifyOtp({
          email: resolvedEmail || undefined,
          token: token,
          type: type === 'magiclink' ? 'magiclink' : type,
        });
        if (error) throw error;
        if (!resolvedUsername && data.user?.user_metadata?.username) {
          resolvedUsername = data.user.user_metadata.username;
        }
      } else {
        // Check if we already have a session (e.g. library handled it automatically)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          return { error: 'Missing magic-link token or session. Please request a new link.' };
        }
      }

      // 2. Sync with backend
      if (!resolvedUsername) {
        const { data: { session } } = await supabase.auth.getSession();
        resolvedUsername = session?.user?.user_metadata?.username;
      }

      if (!resolvedUsername) {
        return { error: 'Could not resolve username from magic link. Please request a new link.' };
      }

      localStorage.removeItem(PENDING_MAGIC_LINK_KEY);

      const loginResult = await login({ username: resolvedUsername });

      if (loginResult.success && isRemoteLogin) {
        console.log('[UserContext] Detected remote login completion, broadcasting session...');
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          await socket.completeRemoteLogin(requestId, session, user || loginResult.userData || { username: resolvedUsername });

          // DO NOT call logout() here because it calls supabase.auth.signOut()
          // which invalidates the session globally.
          // Instead, just clear local state and storage on this device.
          localStorage.removeItem(SESSION_USER_KEY);
          localStorage.removeItem(SESSION_USER_DATA_KEY);
          setUser(null);

          return { success: true, remote: true };
        }
      }

      return loginResult;
    } catch (error) {
      console.error('[UserContext] completeMagicLinkSignIn error:', error);
      return { error: error.message || 'Magic link is invalid or expired. Request a new link.' };
    }
  }, [login, user]);

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
    requestMagicLink,
    completeMagicLinkSignIn,
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
