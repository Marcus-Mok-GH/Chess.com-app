import { API_BASE_URL, isNetworkError } from './apiBase';

console.log('[API] Using API URL:', API_BASE_URL);

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorMessage = `HTTP error ${response.status}`;
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Response wasn't JSON
        }
        const error = new Error(`[Database Error] ${endpoint}: ${errorMessage}`);
        console.error(`🔴 DATABASE ERROR [${endpoint}]:`, errorMessage);
        throw error;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Handle various network/connection errors
      if (isNetworkError(error)) {
        const connectionError = new Error(`[Database Connection Failed] Cannot reach server at ${API_BASE_URL}. Check if the server is running.`);
        console.error('🔴 DATABASE CONNECTION FAILED:', connectionError.message);
        console.error('🔴 Original error:', error.message);
        throw connectionError;
      }
      if (!error.message.startsWith('[Database')) {
        console.error(`🔴 DATABASE ERROR [${endpoint}]:`, error.message);
      }
      throw error;
    }
  }

  // User endpoints
  async login(username) {
    return this.request('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async getUser(username) {
    return this.request(`/users/${encodeURIComponent(username)}`);
  }

  async getUserSettings(username) {
    return this.request(`/users/${encodeURIComponent(username)}/settings`);
  }

  async updateUserSettings(username, settings) {
    return this.request(`/users/${encodeURIComponent(username)}/settings`, {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  }

  async updateElo(username, opponentElo, result) {
    return this.request(`/users/${encodeURIComponent(username)}/elo`, {
      method: 'POST',
      body: JSON.stringify({ opponentElo, result }),
    });
  }

  async getLeaderboard(limit = 10) {
    return this.request(`/users/leaderboard/top?limit=${limit}`);
  }

  async getEloHistory(username, limit = 100) {
    return this.request(`/users/${encodeURIComponent(username)}/elo-history?limit=${limit}`);
  }

  // Matchmaking endpoints
  async getQueueStatus() {
    return this.request('/matchmaking/status');
  }

  async getQueueDetails() {
    return this.request('/matchmaking/details');
  }

  // Health check
  async healthCheck() {
    try {
      // Health endpoint is at root level, proxied through Vite
      const response = await fetch('/health');
      if (!response.ok) {
        const error = new Error(`[Database Error] Health check failed: HTTP ${response.status}`);
        console.error('🔴 DATABASE HEALTH CHECK FAILED:', error.message);
        throw error;
      }
      return await response.json();
    } catch (error) {
      // Handle various network/connection errors
      if (isNetworkError(error)) {
        const connectionError = new Error(`[Database Connection Failed] Cannot reach server. Check if the server is running on port 3001.`);
        console.error('🔴 DATABASE CONNECTION FAILED:', connectionError.message);
        console.error('🔴 Original error:', error.message);
        throw connectionError;
      }
      if (!error.message.startsWith('[Database')) {
        console.error('🔴 DATABASE HEALTH CHECK FAILED:', error.message);
      }
      throw error;
    }
  }

  // Save game result to database
  // Supports both legacy positional args and object payload.
  async saveGame(moveHistoryOrPayload, result, gameMode = 'friendly', userId = null) {
    const payload =
      typeof moveHistoryOrPayload === 'object' && moveHistoryOrPayload !== null
        ? moveHistoryOrPayload
        : {
            gameMode,
            userId,
            result,
            moveHistory: moveHistoryOrPayload,
          };

    return this.request('/games/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Get game history
  async getGameHistory(username, limit = 20) {
    return this.request(`/games/history/${encodeURIComponent(username)}?limit=${limit}`);
  }

  // Get per-user move history for a match
  async getMatchMoves(gameId, username) {
    return this.request(
      `/games/match-moves/${encodeURIComponent(gameId)}/${encodeURIComponent(username)}`
    );
  }

  // Get single game by code
  async getGameByCode(gameCode) {
    return this.request(`/games/by-code/${encodeURIComponent(gameCode)}`);
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

  // Create a friendly online game record
  async createOnlineGame({ gameCode, playerId, playerName, playerColor, playerElo }) {
    return this.request('/games/online/create', {
      method: 'POST',
      body: JSON.stringify({
        gameCode,
        playerId,
        playerName,
        playerColor,
        playerElo,
      }),
    });
  }

  // Join a friendly online game
  async joinOnlineGame({ gameCode, playerId, playerName, playerElo }) {
    return this.request('/games/online/join', {
      method: 'POST',
      body: JSON.stringify({
        gameCode,
        playerId,
        playerName,
        playerElo,
      }),
    });
  }

  // Leave a friendly online game
  async leaveOnlineGame({ gameCode, playerId }) {
    return this.request('/games/online/leave', {
      method: 'POST',
      body: JSON.stringify({
        gameCode,
        playerId,
      }),
    });
  }
}

export const api = new ApiService();
export default api;
