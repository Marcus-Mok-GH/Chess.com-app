import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import socket from '../services/socket';

export function useMagicLinkSerializer() {
  const serialize = useCallback((url) => {
    const urlObj = new URL(url, window.location.origin);
    const params = new URLSearchParams(urlObj.search);
    
    const code = params.get('code');
    const token = params.get('token') || params.get('access_token');
    const tokenHash = params.get('token_hash');
    const requestId = params.get('requestId');
    const magicType = params.get('type') || 'magiclink';
    
    // Also check hash
    let hashToken = null;
    let hashRefreshToken = null;
    
    if (urlObj.hash) {
      const hashParams = new URLSearchParams(urlObj.hash.slice(1));
      hashToken = hashParams.get('token') || hashParams.get('access_token');
      hashRefreshToken = hashParams.get('refresh_token');
    }
    
    return {
      code,
      token: token || hashToken,
      tokenHash,
      accessToken: token || hashToken,
      refreshToken: hashRefreshToken,
      requestId,
      type: magicType,
    };
  }, []);

  const magicUrlForEmail = useCallback((username, email, url) => {
    if (!url) {
      return `${window.location.origin}/login?type=magiclink&email=${encodeURIComponent(email)}&username=${encodeURIComponent(username)}`;
    }
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    
    params.set('email', email);
    params.set('username', username);
    params.set('type', 'magiclink');
    
    return urlObj.toString();
  }, []);

  return { serialize, magicUrlForEmail };
}

/**
 * Detects magic-link callback parameters from a URL and completes the sign-in flow when present.
 *
 * Parses the provided URL for magic-link callback parameters, attempts to finalize authentication by
 * exchanging a code or verifying a token/token_hash with Supabase, clears related pending state in
 * localStorage, updates auth state via the optional setter, and optionally finalizes a remote login.
 *
 * @param {string | null | undefined} url - The URL to inspect for magic-link callback parameters.
 * @param {(state: Object) => void} [setAuthState] - Optional state setter to report loading or error states.
 * @returns {{ handleCompleteMagicLinkSignIn: (username: string, params: Object, isRemoteLogin?: boolean) => Promise<void>, pendingData: any }}
 *          An object containing:
 *          - `handleCompleteMagicLinkSignIn(username, params, isRemoteLogin)` — completes the magic-link sign-in flow for a given username and parsed params; when `isRemoteLogin` is true and a requestId is present the function will finalize remote login.
 *          - `pendingData` — local pending magic-link state (may be null).
 */
export function useMagicLinkAuth(url, setAuthState) {
  const { serialize } = useMagicLinkSerializer();
  const [pendingData, setPendingData] = useState(null);

  // Try to auto-complete auth if params present
  useEffect(() => {
    if (!url) return;
    
    const params = serialize(url);
    const hasCallback = params.code || params.token || params.tokenHash;
    
    if (hasCallback) {
      const pending = JSON.parse(localStorage.getItem('chess_pending_magic_link') || '{}');
      
      const username = pending.username || pending.user_metadata?.username || '';
      
      if (username) {
        handleCompleteMagicLinkSignIn(username, params, false);
      } else {
        console.error('Magic link callback received but no username context found');
      }
    }
  }, [url, serialize]);

  const handleCompleteMagicLinkSignIn = async (
    username,
    params,
    isRemoteLogin = false
  ) => {
    if (params.code || params.token || params.tokenHash) {
      try {
        if (params.code && supabase.auth.exchangeCodeForSession) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
          
          if (data.user?.user_metadata?.username) {
            username = data.user.user_metadata.username;
          }
        } else if (params.tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            email: undefined,
            token_hash: params.tokenHash,
            type: 'email', // 'magiclink' is deprecated; 'email' covers all email-based flows
          });
          if (error) throw error;

          if (data.user?.user_metadata?.username) {
            username = data.user.user_metadata.username;
          }
        } else if (params.token) {
          const { data, error } = await supabase.auth.verifyOtp({
            email: undefined,
            token: params.token,
            type: 'email', // 'magiclink' is deprecated; 'email' covers all email-based flows
          });
          if (error) throw error;
          
          if (data.user?.user_metadata?.username) {
            username = data.user.user_metadata.username;
          }
        }
      } catch (error) {
        console.error('Failed to process magic link:', error);
        if (setAuthState) {
          setAuthState({ error: 'Invalid magic link. Please request a new link.', success: false });
        }
        return;
      }
    }

    localStorage.removeItem('chess_pending_magic_link');
    localStorage.removeItem('chess_auth_request_id');
    
    if (setAuthState) {
      setAuthState({ loading: true });
    }
    
    const firstParam = serialize(url);
    
    if (isRemoteLogin && firstParam.requestId) {
      await socket.completeRemoteLogin(firstParam.requestId, null, { username });
    }
    
    // Don't call completeMagicLinkSignIn here to avoid circular logic
    // The app lifecycle should handle setting isLoggedIn state
  };

  return {
    handleCompleteMagicLinkSignIn,
    pendingData,
  };
}
