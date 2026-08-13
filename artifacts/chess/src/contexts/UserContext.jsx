import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { neonAuth } from '../services/neonAuth';
import socket from '../services/socket';

const SESSION_USER_KEY = 'chess_user_session';
const SESSION_USER_DATA_KEY = 'chess_user_data';
const SESSION_TOKEN_KEY = 'chess_user_token';
const PENDING_OTP_KEY = 'chess_pending_otp';
const AUTH_REQUEST_ID_KEY = 'chess_auth_request_id';

// Mirrors the backend's 7-day sliding-window (SESSION_DAYS = 7).
// If a cached user snapshot is older than this, treat it as expired and force a logout.
const SESSION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_CACHE_EPOCH_KEY = 'chess_user_cache_epoch';

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
    // Slide the 7-day window forward on every successful (re)validation.
    try { localStorage.setItem(SESSION_CACHE_EPOCH_KEY, String(Date.now())); } catch {}
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

  const initRanRef = useRef(false);

  useEffect(() => {
    // The component re-mounted (route change). Don't re-run a full backend re-validation
    // every time — that's what was causing transients to log you out on navigation. The
    // cache is rendered instantly on mount; we only re-validate the backend once per
    // REAL mount and only when needed.
    if (initRanRef.current) return;
    initRanRef.current = true;

    let isMounted = true;
    async function init() {
      // 1. Cache-first: render the remembered user immediately, before any network call,
      //    so navigation never blanks the logged-in state mid-flight.
      const cachedUserRaw = (() => {
        try { return localStorage.getItem(SESSION_USER_DATA_KEY); } catch { return null; }
      })();
      const cacheEpoch = (() => {
        try { return Number(localStorage.getItem(SESSION_CACHE_EPOCH_KEY) || '0'); } catch { return 0; }
      })();
      const cacheFresh = cacheEpoch > 0 && (Date.now() - cacheEpoch) < SESSION_CACHE_TTL_MS;
      if (cachedUserRaw && isMounted) {
        try {
          const saved = JSON.parse(cachedUserRaw);
          if (saved?.username) setUser(saved);
        } catch { try { localStorage.removeItem(SESSION_USER_DATA_KEY); } catch {} }
      }

      // No token → definitely not logged in. Don't bother the backend.
      const storedToken = (() => { try { return localStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; } })();
      if (!storedToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      // 2. Ask the backend whether the session is still alive. This is the call that
      //    was being treated as authoritative even on transient failures.
      let sessionResult;
      try {
        sessionResult = await neonAuth.getSession({ token: storedToken });
      } catch (e) {
        // Network throw = transient. Keep the cached login if the cache is still fresh.
        console.warn('[UserContext] getSession threw (transient):', e?.message || e);
        if (isMounted) {
          if (!cacheFresh) {
            // Cache expired past 7d AND backend unreachable → must log out.
            if (!localStorage.getItem(PENDING_OTP_KEY)) {
              setUser(null);
              setToken(null);
              try {
                localStorage.removeItem(SESSION_USER_KEY);
                localStorage.removeItem(SESSION_USER_DATA_KEY);
                localStorage.removeItem(SESSION_TOKEN_KEY);
                localStorage.removeItem(SESSION_CACHE_EPOCH_KEY);
              } catch {}
            }
          }
          setIsLoading(false);
        }
        return;
      }

      const ok = !!sessionResult?.success;
      const body = sessionResult?.data && typeof sessionResult.data === 'object'
        ? sessionResult.data
        : null;
      const session = body?.session || null;
      const serverUser = body?.user || null;
      // The backend now returns 503 { kind: 'transient' } when the DB is unreachable,
      // which surfaces here as ok===false with no session/user. A definitive logout is
      // ok===true with { session: null, user: null }.
      const transient = !ok && !session && !serverUser;

      if (!cacheFresh && !session && !serverUser) {
        // No fresh cache AND backend says/implies "not logged in" → real logout.
        if (isMounted) {
          if (!localStorage.getItem(PENDING_OTP_KEY)) {
            setUser(null);
            setToken(null);
            try {
              localStorage.removeItem(SESSION_USER_KEY);
              localStorage.removeItem(SESSION_USER_DATA_KEY);
              localStorage.removeItem(SESSION_TOKEN_KEY);
              localStorage.removeItem(SESSION_CACHE_EPOCH_KEY);
            } catch {}
          }
          setIsLoading(false);
        }
        return;
      }

      // At this point EITHER:
      //   (a) we got a fresh server confirmation (session + user) → slide the window forward, or
      //   (b) the backend was transient but our cache is still within 7d → keep the cached login.
      if (session && serverUser) {
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
          try { localStorage.removeItem(PENDING_OTP_KEY); } catch {}
        }
      } else if (transient && cacheFresh) {
        // Genuinely transient (DB outage / 503) with a fresh cache → keep the cached login.
        if (isMounted) setIsAwaitingVerification(false);
      } else if (!transient && cacheFresh) {
        // Backend gave a definitive "not logged in" response (ok===true, no session/user).
        // Honor it even with a fresh cache — don't let a stale 7-day cache bypass logout.
        if (isMounted && !localStorage.getItem(PENDING_OTP_KEY)) {
          setUser(null);
          setToken(null);
          try {
            localStorage.removeItem(SESSION_USER_KEY);
            localStorage.removeItem(SESSION_USER_DATA_KEY);
            localStorage.removeItem(SESSION_TOKEN_KEY);
            localStorage.removeItem(SESSION_CACHE_EPOCH_KEY);
          } catch {}
        }
      }

      if (isMounted) setIsLoading(false);
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
    await neonAuth.signOut({ token }).catch(() => {});
    localStorage.clear();
    setUser(null);
    setToken(null);
    window.location.href = '/';
  }, [token]);

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