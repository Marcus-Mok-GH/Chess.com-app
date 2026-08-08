import { API_BASE_URL, isNetworkError } from '../../services/apiBase';

let coachStatus = null;

function getToken() {
  try { return localStorage.getItem('chess_user_token'); } catch { return null; }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function coachRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || data.error || `Coach request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function getCoachStatus(force = false) {
  if (coachStatus && !force) return coachStatus;
  try {
    coachStatus = await coachRequest('/coach/status', { headers: { Accept: 'application/json' } });
    return coachStatus;
  } catch (error) {
    console.error('[CoachAI] Status check failed:', error);
    coachStatus = { available: false, connected: false, billing: 'user-pays-with-free-fallback' };
    return coachStatus;
  }
}

export async function isCoachAIAvailable() {
  const status = await getCoachStatus();
  return Boolean(status.available && status.connected);
}

export function getCoachConnectionUrl() {
  return `${API_BASE_URL}/coach/connect`;
}

export async function connectCoach() {
  const data = await coachRequest('/coach/connect', { method: 'POST', body: '{}' });
  if (!data.authorizationUrl) throw new Error('Pollinations connection URL was not returned.');
  window.location.assign(data.authorizationUrl);
  return data.authorizationUrl;
}

export async function disconnectCoach() {
  const result = await coachRequest('/coach/disconnect', { method: 'POST', body: '{}' });
  coachStatus = { ...coachStatus, connected: false };
  return result;
}

export async function getCoachingFeedback(fen, playerMove, moveHistory, onStream = null) {
  try {
    const data = await coachRequest('/coach/feedback', {
      method: 'POST', body: JSON.stringify({ fen, playerMove, moveHistory }),
    });
    if (onStream && data.feedback) onStream(data.feedback);
    return data.feedback || null;
  } catch (error) {
    if (!isNetworkError(error)) console.error('[CoachAI] Feedback error:', error);
    throw error;
  }
}

export async function explainCoachMove(fenBefore, move, fenAfter, onStream = null) {
  try {
    const data = await coachRequest('/coach/explain', {
      method: 'POST', body: JSON.stringify({ fenBefore, move, fenAfter }),
    });
    if (onStream && data.explanation) onStream(data.explanation);
    return data.explanation || null;
  } catch (error) {
    if (!isNetworkError(error)) console.error('[CoachAI] Explain error:', error);
    throw error;
  }
}

export async function analyzeGame(moveHistory, result, gameId = null) {
  try {
    const data = await coachRequest('/coach/analyze', {
      method: 'POST', body: JSON.stringify({ moveHistory, result, gameId }),
    });
    return data.analysis || null;
  } catch (error) {
    if (!isNetworkError(error)) console.error('[CoachAI] Analyze error:', error);
    throw error;
  }
}
