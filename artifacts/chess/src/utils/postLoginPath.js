const POST_LOGIN_KEY = 'chess:postLoginPath'

// Only same-origin, absolute-path destinations are accepted. `//host` and
// anything with a scheme is rejected so a crafted link cannot turn the login
// page into an open redirect.
const SAFE_PATH = /^\/(?!\/)[\w\-./?=&%~+]*$/

function isSafePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && SAFE_PATH.test(value)
}

/**
 * Record where a guest was heading before being sent to /login, so sign-in can
 * return them there. Kept in sessionStorage: it is per-tab, survives the OTP
 * round trip, and disappears when the browser session ends.
 * @param {string} path Router path, optionally with a query string.
 */
export function rememberPostLoginPath(path) {
  if (typeof window === 'undefined' || !isSafePath(path)) return
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/verify-email')) return
  try {
    window.sessionStorage.setItem(POST_LOGIN_KEY, path)
  } catch {
    /* storage blocked or full — a plain /home landing is an acceptable fallback */
  }
}

/**
 * Read and clear the remembered destination. Call once, after sign-in completes.
 * @returns {string} A safe in-app path, or '/home' when nothing was stored.
 */
export function consumePostLoginPath() {
  if (typeof window === 'undefined') return '/home'
  try {
    const stored = window.sessionStorage.getItem(POST_LOGIN_KEY)
    window.sessionStorage.removeItem(POST_LOGIN_KEY)
    return isSafePath(stored) ? stored : '/home'
  } catch {
    return '/home'
  }
}

export const POST_LOGIN_STORAGE_KEY = POST_LOGIN_KEY
