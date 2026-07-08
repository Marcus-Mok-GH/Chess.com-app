import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { neonAuth } from '../services/neonAuth';
import socket from '../services/socket';

const SESSION_USER_KEY = 'chess_user_session';
const SESSION_USER_DATA_KEY = 'chess_user_data';
const SESSION_TOKEN_KEY = 'chess_user_token';
const PENDING_OTP_KEY = 'chess_pending_otp';
const AUTH_REQUEST_ID_KEY = 'chess_auth_request_id';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(SESSION_TOKEN_KEY));
  const userRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isAwaitingVerification, setIsAwaitingVerification] = useState(() => {
    try { return !!localStorage.getItem(PENDING_OTP_KEY); } catch { return false; }
  });
  const [pendingOtpEmail, setPendingOtpEmail] = useState(() => {
    try {
      const raw = localStorage.getItem(PENDING_OTP_KEY);
      return raw ? (JSON.parse(raw).email || '') : '';
    } catch { return ''; }
  });

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const persistUser = useCallback((userData, sessionToken) => {
    if (!userData?.username) return;
    localStorage.setItem(SESSION_USER_KEY, userData.username);
    localStorage.setItem(SESSION_USER_DATA_KEY, JSON.stringify(userData));
    if (sessionToken) {
      localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
      setToken(sessionToken);
    }
  }, []);

  useEffect(() => {
    const requestId = localStorage.getItem(AUTH_REQUEST_ID_KEY);
    if (requestId) socket.joinAuthRoom(requestId);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const sessionUserRaw = localStorage.getItem(SESSION_USER_DATA_KEY);
        if (sessionUserRaw && isMounted) {
          try {
            const saved = JSON.parse(sessionUserRaw);
            if (saved?.username) setUser(saved);
          } catch { localStorage.removeItem(SESSION_USER_DATA_KEY); }
        }

        const sessionResult = await neonAuth.getSession({ token });
        const body = sessionResult?.data && typeof sessionResult.data === 'object'
          ? sessionResult.data
          : null;
        const session = body?.session || null;
        const serverUser = body?.user || null;

        if (!session || !serverUser) {
          if (isMounted && !localStorage.getItem(PENDING_OTP_KEY)) {
            setUser(null);
            setToken(null);
            localStorage.removeItem(SESSION_USER_KEY);
            localStorage.removeItem(SESSION_USER_DATA_KEY);
            localStorage.removeItem(SESSION_TOKEN_KEY);
          }
          return;
        }

        const userData = {
          id: serverUser.id,
          username: serverUser.username || serverUser.name,
          email: serverUser.email,
          elo: serverUser.elo || 1200,
          gamesPlayed: serverUser.gamesPlayed || 0,
          wins: serverUser.wins || 0,
          losses: serverUser.losses || 0,
          draws: serverUser.draws || 0,
          createdAt: serverUser.createdAt,
          needsUsername: !!serverUser.needsUsername,
        };

        if (isMounted) {
          setUser(userData);
          persistUser(userData, session.token || session.id);
          setIsAwaitingVerification(false);
          localStorage.removeItem(PENDING_OTP_KEY);
        }
      } catch (e) {
        console.error('[UserContext] Init error:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    init();
    return () => { isMounted = false; };
  }, [persistUser]);

  const requestOtp = useCallback(async ({ email, username }) => {
    if (!email) return { error: 'Email is required' };
    if (username !== undefined && (typeof username !== 'string' || username.trim().length < 2)) {
      return { error: 'Username must be at least 2 characters.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { error: 'You are offline. Reconnect and try again.' };
    }
    try {
      localStorage.setItem(PENDING_OTP_KEY, JSON.stringify({ email }));
      const result = await neonAuth.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' });
      if (!result.success) {
        const errMsg = typeof result.error === 'string'
          ? result.error
          : (result.error?.message || 'Failed to send code');
        throw new Error(errMsg);
      }
      setIsAwaitingVerification(true);
      setPendingOtpEmail(email);
      return { success: true, message: 'Code sent! Check your email for a 6-digit verification code.' };
    } catch (error) {
      localStorage.removeItem(PENDING_OTP_KEY);
      return { error: error.message };
    }
  }, []);

  const verifyEmailOtp = useCallback(async ({ email, token: otpToken }) => {
    try {
      const result = await neonAuth.signIn.emailOtp({ email: email.trim(), otp: otpToken.trim() });
      if (!result.success) {
        const errMsg = typeof result.error === 'string'
          ? result.error
          : (result.error?.message || 'Invalid or expired code');
        throw new Error(errMsg);
      }

      const data = result.data || {};
      const serverUser = data.user;
      const session = data.session;

      if (!serverUser || !session) throw new Error('Authentication response was incomplete.');

      const userData = {
        id: serverUser.id,
        username: serverUser.username || serverUser.name,
        email: serverUser.email,
        elo: serverUser.elo || 1200,
        gamesPlayed: serverUser.gamesPlayed || 0,
        wins: serverUser.wins || 0,
        losses: serverUser.losses || 0,
        draws: serverUser.draws || 0,
        createdAt: serverUser.createdAt,
        needsUsername: !!serverUser.needsUsername,
      };

      setUser(userData);
      persistUser(userData, session.token || session.id);
      setIsAwaitingVerification(false);
      localStorage.removeItem(PENDING_OTP_KEY);
      return { success: true, userData };
    } catch (error) {
      return { error: error.message };
    }
  }, [persistUser]);

  const updateUsername = useCallback(async (newUsername) => {
    if (!token) return { error: 'Session lost. Please log in again.' };
    try {
      const response = await api.updateUsername(newUsername, token);
      if (response.success && response.user) {
        const updatedUser = { ...user, username: response.user.username, needsUsername: false };
        setUser(updatedUser);
        persistUser(updatedUser, token);
        return { success: true };
      }
      return { error: response.error?.message || 'Failed to update username.' };
    } catch (error) {
      return { error: error.message };
    }
  }, [user, token, persistUser]);

  const logout = useCallback(async () => {
    await neonAuth.signOut().catch(() => {});
    localStorage.clear();
    setUser(null);
    setToken(null);
    window.location.href = '/';
  }, []);

  const value = {
    user, token, isLoggedIn: !!user, isLoading, isOnline,
    isAwaitingVerification, pendingOtpEmail,
    requestOtp, verifyEmailOtp, updateUsername, logout,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
}

export default UserContext;