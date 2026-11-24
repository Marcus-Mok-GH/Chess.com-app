/** localStorage accessors that never throw (private mode, quota, etc.). */

export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key, value, { warn = false, label = 'safeStorage' } = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (warn) console.warn(`[${label}] Failed to write localStorage:`, err);
    return false;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
