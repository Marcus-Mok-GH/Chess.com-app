import { io } from 'socket.io-client';

function resolveSocketConfig() {
  const isBrowser = typeof window !== 'undefined';
  const devDefault = 'http://localhost:3001';

  const urlEnv = isBrowser
    ? (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL)
    : (process.env?.VITE_SOCKET_URL || process.env?.VITE_SERVER_URL);

  const pathEnv = isBrowser
    ? import.meta.env.VITE_SOCKET_PATH
    : process.env?.VITE_SOCKET_PATH;

  const normalizedUrlEnv = typeof urlEnv === 'string' ? urlEnv.trim() : '';
  let inferredPath = null;
  let inferredBase = null;

  if (normalizedUrlEnv) {
    if (normalizedUrlEnv.startsWith('/')) {
      inferredPath = normalizedUrlEnv;
    } else {
      try {
        const parsed = new URL(normalizedUrlEnv);
        inferredBase = parsed.origin;
        if (parsed.pathname && parsed.pathname !== '/') {
          inferredPath = parsed.pathname;
        }
      } catch (error) {
        // Ignore parse errors and fall back to raw env values.
      }
    }
  }

  const socketPath = (pathEnv || inferredPath || '/socket.io').toString();

  // Determine base URL (host + protocol), never include the socket.io path here.
  let baseUrl;
  const hasCustomUrl = normalizedUrlEnv.length > 0 && !normalizedUrlEnv.startsWith('/');
  const looksLikeLocalhost = hasCustomUrl && /localhost|127\.0\.0\.1/i.test(urlEnv);
  const isLocalPage = isBrowser && /localhost|127\.0\.0\.1/i.test(window.location.hostname);

  if (hasCustomUrl && !(isBrowser && looksLikeLocalhost && !isLocalPage)) {
    baseUrl = inferredBase || normalizedUrlEnv;
  } else if (isBrowser) {
    // In development, use window.location.origin to go through Vite's proxy
    // This avoids CORS/WebSocket issues when connecting cross-origin
    baseUrl = import.meta.env.DEV ? window.location.origin : window.location.origin;
  } else {
    baseUrl = devDefault;
  }

  return { url: baseUrl, path: socketPath };
}

const SOCKET_CONFIG = resolveSocketConfig();

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isConnecting = false;
  }

  connect() {
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      return Promise.resolve();
    }

    if (this.isConnecting) {
      console.log('[Socket] Connection already in progress');
      return Promise.resolve();
    }

    this.isConnecting = true;
    console.log('[Socket] Connecting to server:', SOCKET_CONFIG);

    return new Promise((resolve, reject) => {
      const transportEnv = import.meta.env.VITE_SOCKET_TRANSPORTS || (typeof process !== 'undefined' ? process.env?.VITE_SOCKET_TRANSPORTS : '');
      const transports = (transportEnv || '').split(',').map(t => t.trim()).filter(Boolean);

      this.socket = io(SOCKET_CONFIG.url, {
        path: SOCKET_CONFIG.path,
        transports: transports.length ? transports : ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        polling: {
          timeout: 10000
        }
      });

      const connectTimeout = setTimeout(() => {
        console.warn('[Socket] Connection timeout');
        this.isConnecting = false;
        resolve(); // Don't reject, just resolve to allow app to continue
      }, 15000);

      this.socket.on('connect', () => {
        clearTimeout(connectTimeout);
        console.log('[Socket] Connected:', this.socket.id);
        this.isConnected = true;
        this.isConnecting = false;
        this.emit('connection_status', { connected: true });
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        clearTimeout(connectTimeout);
        console.log('[Socket] Disconnected:', reason);
        this.isConnected = false;
        this.isConnecting = false;
        this.emit('connection_status', { connected: false, reason });
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(connectTimeout);
        console.error('[Socket] Connection error:', error);
        this.isConnecting = false;
        // Provide user-friendly error messages instead of raw WebSocket errors
        let friendlyError = 'Unable to connect to server';
        if (error.message?.toLowerCase().includes('websocket')) {
          friendlyError = 'Connection failed. Retrying...';
        } else if (error.message?.toLowerCase().includes('timeout')) {
          friendlyError = 'Connection timed out. Retrying...';
        } else if (error.message?.toLowerCase().includes('cors')) {
          friendlyError = 'Connection blocked. Please refresh the page.';
        }
        this.emit('connection_error', { error: friendlyError, rawError: error.message });
        resolve(); // Don't reject, allow app to continue offline
      });

      // Set up default event listeners
      this.setupDefaultListeners();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
  }

  setupDefaultListeners() {
    if (!this.socket) return;

    // Matchmaking events
    this.socket.on('match_found', (data) => {
      console.log('[Socket] Match found:', data);
      this.emit('match_found', data);
    });

    this.socket.on('matchmaking_status', (data) => {
      console.log('[Socket] Matchmaking status:', data);
      this.emit('matchmaking_status', data);
    });

    this.socket.on('queue_status', (data) => {
      console.log('[Socket] Queue status:', data);
      this.emit('queue_status', data);
    });

    this.socket.on('matchmaking_error', (data) => {
      console.error('[Socket] Matchmaking error:', data);
      this.emit('matchmaking_error', data);
    });

    // Game events
    this.socket.on('game_state', (data) => {
      console.log('[Socket] Game state:', data);
      this.emit('game_state', data);
    });

    this.socket.on('move_made', (data) => {
      console.log('[Socket] Move made:', data);
      this.emit('move_made', data);
    });

    this.socket.on('game_ended', (data) => {
      console.log('[Socket] Game ended:', data);
      this.emit('game_ended', data);
    });

    this.socket.on('player_joined', (data) => {
      console.log('[Socket] Player joined:', data);
      this.emit('player_joined', data);
    });

    this.socket.on('player_left', (data) => {
      console.log('[Socket] Player left:', data);
      this.emit('player_left', data);
    });

    this.socket.on('opponent_disconnected', (data) => {
      console.log('[Socket] Opponent disconnected:', data);
      this.emit('opponent_disconnected', data);
    });

    this.socket.on('draw_offered', (data) => {
      console.log('[Socket] Draw offered:', data);
      this.emit('draw_offered', data);
    });

    this.socket.on('draw_declined', (data) => {
      console.log('[Socket] Draw declined:', data);
      this.emit('draw_declined', data);
    });

    this.socket.on('elo_updated', (data) => {
      console.log('[Socket] ELO updated:', data);
      this.emit('elo_updated', data);
    });

    this.socket.on('chat_message', (data) => {
      console.log('[Socket] Chat message:', data);
      this.emit('chat_message', data);
    });

    // Error events
    this.socket.on('game_error', (data) => {
      console.error('[Socket] Game error:', data);
      this.emit('game_error', data);
    });

    this.socket.on('move_error', (data) => {
      console.error('[Socket] Move error:', data);
      this.emit('move_error', data);
    });
  }

  // Event emitter pattern for React components
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Socket] Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Matchmaking methods
  joinMatchmaking(playerId, playerName, elo, isRanked = true) {
    if (!this.socket?.connected) {
      console.error('[Socket] Cannot join matchmaking: not connected');
      return false;
    }

    this.socket.emit('join_matchmaking', {
      playerId,
      playerName,
      elo,
      isRanked
    });
    return true;
  }

  leaveMatchmaking(playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('leave_matchmaking', { playerId });
    return true;
  }

  sendMatchmakingHeartbeat(playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('matchmaking_heartbeat', { playerId });
    return true;
  }

  getQueueDetails() {
    if (!this.socket?.connected) return false;

    this.socket.emit('get_queue_details');
    return true;
  }

  getQueueStatus() {
    if (!this.socket?.connected) return false;

    this.socket.emit('get_queue_status');
    return true;
  }

  // Game methods
  joinGame(gameId, playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('join_game', { gameId, playerId });
    return true;
  }

  makeMove(gameId, fen, lastMove, moveHistory, playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('make_move', {
      gameId,
      fen,
      lastMove,
      moveHistory,
      playerId
    });
    return true;
  }

  endGame(gameId, result, reason) {
    if (!this.socket?.connected) return false;

    this.socket.emit('game_over', { gameId, result, reason });
    return true;
  }

  resignGame(gameId, playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('resign_game', { gameId, playerId });
    return true;
  }

  offerDraw(gameId, playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('offer_draw', { gameId, playerId });
    return true;
  }

  respondDraw(gameId, playerId, accepted) {
    if (!this.socket?.connected) return false;

    this.socket.emit('respond_draw', { gameId, playerId, accepted });
    return true;
  }

  sendMessage(gameId, playerId, message) {
    if (!this.socket?.connected) return false;

    this.socket.emit('send_message', { gameId, playerId, message });
    return true;
  }

  leaveGame(gameId, playerId) {
    if (!this.socket?.connected) return false;

    this.socket.emit('leave_game', { gameId, playerId });
    this.socket.leave(gameId);
    return true;
  }
}

export default new SocketService();
