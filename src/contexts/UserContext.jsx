import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { supabase } from '../services/supabase';

const SESSION_USER_KEY = 'chess_user_session';
const SESSION_USER_DATA_KEY = 'chess_user_data';

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

  // Load user session on mount
  useEffect(() => {
    let isMounted = true;
    
    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          localStorage.removeItem(SESSION_USER_KEY);
          localStorage.removeItem(SESSION_USER_DATA_KEY);
        }
      } catch (error) {
        console.warn('[UserContext] Supabase session check failed:', error?.message);
      }

      // Check for existing session (username stored in localStorage)
      try {
        const sessionUserRaw = localStorage.getItem(SESSION_USER_DATA_KEY);
        let sessionUser = null;
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

        const sessionUsername = sessionUser?.username || localStorage.getItem(SESSION_USER_KEY);
        if (sessionUsername && isMounted) {
          console.log('[UserContext] Found session for:', sessionUsername);
          // Fetch fresh user data from database
          try {
            const serverUser = await api.getUser(sessionUsername);
            if (isMounted) {
              const userData = {
                id: serverUser.id,
                username: serverUser.username,
                elo: serverUser.elo,
                gamesPlayed: serverUser.gamesPlayed,
                wins: serverUser.wins,
                losses: serverUser.losses,
                draws: serverUser.draws,
                createdAt: serverUser.createdAt,
              };
              setUser(userData);
              persistUser(userData);
              console.log('✅ SESSION RESTORED (server):', userData.username);
            }
          } catch (error) {
            console.error('🔴 SESSION RESTORE FAILED:', error.message);
            const isConnectionIssue = error.message.includes('Connection Failed') ||
              error.message.includes('Failed to fetch') ||
              error.message.includes('Network');
            const isNotFound = error.message.includes('User not found') ||
              error.message.includes('HTTP error 404');
            if (isNotFound) {
              console.warn('[UserContext] Clearing invalid session');
              localStorage.removeItem(SESSION_USER_KEY);
              localStorage.removeItem(SESSION_USER_DATA_KEY);
              if (isMounted) {
                setUser(null);
              }
            } else if (!isConnectionIssue) {
              console.warn('[UserContext] Keeping cached session after restore error');
            }
          }
        }
      } catch (e) {
        console.error('🔴 SESSION LOAD ERROR:', e.message);
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    }

    init();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async ({ username, email, otp }) => {
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
      console.log('[UserContext] Logging in with Supabase:', email);

      const verifyResult = await supabase.auth.verifyOtp({ email, token: otp });
      if (verifyResult.error) {
        throw verifyResult.error;
      }

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

      return { success: true, isNewUser: response.isNewUser };
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

  const requestLoginOtp = useCallback(async ({ email, username }) => {
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();

    if (!trimmedEmail) {
      return { error: 'Email is required' };
    }

    if (!trimmedUsername || trimmedUsername.length < 2) {
      return { error: 'Username must be at least 2 characters' };
    }

    if (!navigator.onLine) {
      return { error: 'You must be online to request a code' };
    }

    try {
      const result = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        data: { username: trimmedUsername },
      });
      if (result.error) {
        throw result.error;
      }
      return { success: true };
    } catch (error) {
      return { error: error.message || 'Failed to send verification code.' };
    }
  }, []);

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
    requestLoginOtp,
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
