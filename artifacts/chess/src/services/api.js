import { API_BASE_URL, isNetworkError } from './apiBase';

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = (() => {
      try { return localStorage.getItem('chess_user_token'); } catch { return null; }
    })();
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        const errorMessage = data.error?.message || data.error || `HTTP error ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      if (isNetworkError(error)) {
        throw new Error('Cannot reach server. Please check your connection.');
      }
      throw error;
    }
  }

  async login(username) {
    return this.request('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async updateUsername(username, token) {
    return this.request('/auth/update-username', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
  }

  async getUserSettings(username, token = null) {
    return this.request(`/users/${encodeURIComponent(username)}/settings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async updateUserSettings(username, settings, token = null) {
    return this.request(`/users/${encodeURIComponent(username)}/settings`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ settings }),
    });
  }

  async getUser(username) {
    return this.request(`/users/${encodeURIComponent(username)}`);
  }

  async getLeaderboard(limit = 10) {
    return this.request(`/users/leaderboard/top?limit=${limit}`);
  }

  async getEloHistory(username, limit = 100) {
    return this.request(`/users/${encodeURIComponent(username)}/elo-history?limit=${limit}`);
  }

  async getQueueStatus() {
    return this.request('/matchmaking/status');
  }

  async getPublicStats() {
    return this.request('/stats/public');
  }

  async saveGame(payload) {
    return this.request('/games/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGameHistory(username, limit = 20) {
    return this.request(`/games/history/${encodeURIComponent(username)}?limit=${limit}`);
  }

  // Get in-progress local game by code and username
  async getLocalGameByCode(username, gameCode) {
    return this.request(`/games/local/${encodeURIComponent(username)}/${encodeURIComponent(gameCode)}`);
  }

  // Create a friendly local game record
  async createLocalGame({ gameCode, userId, username, opponentName, opponentElo, playerColor }) {
    return this.request('/games/local/create', {
      method: 'POST',
      body: JSON.stringify({
        gameCode,
        userId,
        username,
        opponentName,
        opponentElo,
        playerColor,
      }),
    });
  }

  async createOnlineGame({ playerId, playerName, playerColor, playerElo, gameCode }) {
    return this.request('/games/online/create', {
      method: 'POST',
      body: JSON.stringify({ playerId, playerName, playerColor, playerElo, gameCode }),
    });
  }

  async joinOnlineGame({ gameCode, playerId, playerName, playerElo }) {
    return this.request('/games/online/join', {
      method: 'POST',
      body: JSON.stringify({ gameCode, playerId, playerName, playerElo }),
    });
  }

  async leaveOnlineGame({ gameCode, playerId }) {
    return this.request('/games/online/leave', {
      method: 'POST',
      body: JSON.stringify({ gameCode, playerId }),
    });
  }

  async getGameByCode(gameCode) {
    return this.request(`/games/by-code/${encodeURIComponent(gameCode)}`);
  }

  async postMove({ gameId, move, playerId, expectedMoveCount, token }) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    return this.request(`/games/${encodeURIComponent(gameId)}/move`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ move, playerId, expectedMoveCount }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  }

  async endOnlineGame({ gameId, playerId, result, reason, token }) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    return this.request(`/games/${encodeURIComponent(gameId)}/end`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ playerId, result, reason }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  }

  async getEngineMove({ fen, bot }) {
    return this.request('/engine/move', {
      method: 'POST',
      body: JSON.stringify({ fen, bot }),
    });
  }
}

export const api = new ApiService();
export default api;