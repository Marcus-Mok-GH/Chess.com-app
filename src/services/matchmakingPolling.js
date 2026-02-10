import api from './api.js';

class MatchmakingPollingService {
  constructor() {
    this.pollingInterval = null;
    this.heartbeatInterval = null;
    this.listeners = new Map();
    this.isPolling = false;
    this.currentPlayerId = null;
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
      const data = JSON.stringify({ playerId });
      const success = navigator.sendBeacon('/api/matchmaking/leave', data);
      console.log('[MatchmakingPolling] Leave beacon sent:', playerId, success ? 'success' : 'queued');
    } catch (error) {
      console.error('[MatchmakingPolling] Error sending leave beacon:', error);
    }

    this.currentPlayerId = null;
  }

  // Start polling for matches
  startPolling(playerId) {
    if (this.isPolling) {
      this.stopPolling();
    }

    this.isPolling = true;
    console.log('[MatchmakingPolling] Starting polling for matches...');

    // Poll every 3 seconds
    this.pollingInterval = setInterval(async () => {
      if (!this.isPolling) return;

      try {
        const response = await fetch(`/api/matchmaking/check-match?playerId=${encodeURIComponent(playerId)}`);
        const data = await response.json();

        if (data.matchFound) {
          console.log('[MatchmakingPolling] Match found:', data);
          this.stopPolling();
          this.emit('match_found', data);
        }
      } catch (error) {
        console.error('[MatchmakingPolling] Error polling for match:', error);
        // Continue polling on error, just log it
      }
    }, 3000);
  }

  // Stop polling
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isPolling = false;
    console.log('[MatchmakingPolling] Stopped polling');
  }

  // Start heartbeat to keep queue entry alive
  startHeartbeat(playerId) {
    // Send heartbeat every 20 seconds
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch('/api/matchmaking/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ playerId }),
        });
      } catch (error) {
        console.error('[MatchmakingPolling] Error sending heartbeat:', error);
      }
    }, 20000);
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
  }
}

export default new MatchmakingPollingService();
