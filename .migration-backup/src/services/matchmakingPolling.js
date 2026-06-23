import api from './api.js';

class MatchmakingPollingService {
  constructor() {
    this.pollingInterval = null;
    this.heartbeatInterval = null;
    this.listeners = new Map();
    this.isPolling = false;
    this.currentPlayerId = null;
    
    // Enhanced polling configuration
    this.pollingConfig = {
      baseInterval: 2000,      // Base polling interval (2s)
      maxInterval: 8000,       // Max interval for backoff (8s)
      backoffFactor: 1.5,      // Exponential backoff factor
      heartbeatInterval: 15000, // Heartbeat every 15s
      maxRetries: 5,          // Max retry attempts on failures
      retryDelay: 2000         // Delay between retries
    };
    
    // State tracking
    this.retryCount = 0;
    this.currentInterval = this.pollingConfig.baseInterval;
    this.lastPollTime = 0;
    this.consecutiveErrors = 0;
    this.isPaused = false;
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
          console.error(`[MatchmakingPolling] Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Join matchmaking queue via HTTP
  async joinMatchmaking(playerId, playerName, elo, isRanked = true) {
    try {
      const response = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          playerName,
          elo,
          isRanked
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('[MatchmakingPolling] Joined queue:', playerId);
        this.currentPlayerId = playerId;
        this.startPolling(playerId);
        this.startHeartbeat(playerId);
        return true;
      } else {
        console.error('[MatchmakingPolling] Failed to join queue:', data.message);
        this.emit('matchmaking_error', { message: data.message || 'Failed to join matchmaking queue' });
        return false;
      }
    } catch (error) {
      console.error('[MatchmakingPolling] Error joining queue:', error);
      this.emit('matchmaking_error', { message: 'Failed to connect to matchmaking server' });
      return false;
    }
  }

  // Leave matchmaking queue
  async leaveMatchmaking(playerId) {
    this.stopPolling();

    try {
      await fetch('/api/matchmaking/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerId }),
      });
      console.log('[MatchmakingPolling] Left queue:', playerId);
    } catch (error) {
      console.error('[MatchmakingPolling] Error leaving queue:', error);
    }

    this.currentPlayerId = null;
  }

  // Synchronous leave using sendBeacon for reliable cleanup during page unload
  leaveMatchmakingSync(playerId) {
    if (!playerId) return;

    this.stopPolling();

    try {
      const blob = new Blob([JSON.stringify({ playerId })], { type: 'application/json' });
      const success = navigator.sendBeacon('/api/matchmaking/leave', blob);
      console.log('[MatchmakingPolling] Leave beacon sent:', playerId, success ? 'success' : 'queued');
    } catch (error) {
      console.error('[MatchmakingPolling] Error sending leave beacon:', error);
    }

    this.currentPlayerId = null;
  }

  // Start polling for matches with adaptive intervals
  startPolling(playerId) {
    if (this.isPolling) {
      this.stopPolling();
    }

    this.isPolling = true;
    this.retryCount = 0;
    this.currentInterval = this.pollingConfig.baseInterval;
    this.consecutiveErrors = 0;
    console.log('[MatchmakingPolling] Starting polling for matches...');

    // Poll with adaptive intervals
    const pollLoop = async () => {
      if (!this.isPolling || this.isPaused) return;

      try {
        const response = await fetch(
          `/api/matchmaking/check-match?playerId=${encodeURIComponent(playerId)}`,
          {
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache'
            }
          }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Reset error counter on success
        this.consecutiveErrors = 0;
        this.retryCount = 0;
        this.currentInterval = this.pollingConfig.baseInterval;

        if (data.matchFound) {
          console.log('[MatchmakingPolling] ✅ Match found:', data);
          this.stopPolling();
          this.emit('match_found', data);
          return;
        }
        
        this.lastPollTime = Date.now();
      } catch (error) {
        console.error('[MatchmakingPolling] Error polling for match:', error);
        this.consecutiveErrors++;
        this.retryCount++;
        
        // Exponential backoff on errors
        this.currentInterval = Math.min(
          this.currentInterval * this.pollingConfig.backoffFactor,
          this.pollingConfig.maxInterval
        );
        
        // Check if we've exceeded max retries
        if (this.retryCount >= this.pollingConfig.maxRetries) {
          console.error('[MatchmakingPolling] Max retries exceeded, emitting error');
          this.emit('matchmaking_error', {
            message: 'Connection to matchmaking server failed. Please refresh and try again.',
            error: error.message
          });
          this.stopPolling();
          return;
        }
      }
      
      // Schedule next poll with adaptive interval
      if (this.isPolling && !this.isPaused) {
        this.pollingInterval = setTimeout(pollLoop, this.currentInterval);
      }
    };
    
    // Start the polling loop
    pollLoop();
  }

  // Stop polling
  stopPolling() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.heartbeatInterval) {
      clearTimeout(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isPolling = false;
    this.isPaused = false;
    this.retryCount = 0;
    this.currentInterval = this.pollingConfig.baseInterval;
    this.consecutiveErrors = 0;
    console.log('[MatchmakingPolling] Stopped polling');
  }
  
  // Pause polling temporarily
  pausePolling() {
    this.isPaused = true;
    console.log('[MatchmakingPolling] Paused polling');
  }
  
  // Resume polling
  resumePolling() {
    if (!this.isPaused) return;
    this.isPaused = false;
    console.log('[MatchmakingPolling] Resumed polling');
    // Restart polling if we have a current player
    if (this.currentPlayerId && this.isPolling) {
      this.startPolling(this.currentPlayerId);
    }
  }

  // Start heartbeat to keep queue entry alive
  startHeartbeat(playerId) {
    // Send heartbeat at configured interval
    const heartbeatLoop = async () => {
      try {
        const response = await fetch('/api/matchmaking/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({ playerId }),
        });
        
        if (!response.ok) {
          console.warn('[MatchmakingPolling] Heartbeat failed:', response.status);
        }
      } catch (error) {
        console.error('[MatchmakingPolling] Error sending heartbeat:', error);
      }
      
      // Schedule next heartbeat
      if (this.isPolling && !this.isPaused) {
        this.heartbeatInterval = setTimeout(
          heartbeatLoop,
          this.pollingConfig.heartbeatInterval
        );
      }
    };
    
    // Start heartbeat loop
    heartbeatLoop();
  }

  // Get queue details
  async getQueueDetails() {
    try {
      const data = await api.getQueueDetails();
      this.emit('queue_details', data);
    } catch (error) {
      console.error('[MatchmakingPolling] Error getting queue details:', error);
    }
  }

  // Cleanup (use sync leave for reliability)
  disconnect() {
    if (this.currentPlayerId) {
      this.leaveMatchmakingSync(this.currentPlayerId);
    }
    this.stopPolling();
    this.listeners.clear();
    this.currentPlayerId = null;
  }
  
  // Get current status
  getStatus() {
    return {
      isPolling: this.isPolling,
      isPaused: this.isPaused,
      currentPlayerId: this.currentPlayerId,
      currentInterval: this.currentInterval,
      retryCount: this.retryCount,
      consecutiveErrors: this.consecutiveErrors,
      lastPollTime: this.lastPollTime
    };
  }
}

export default new MatchmakingPollingService();
