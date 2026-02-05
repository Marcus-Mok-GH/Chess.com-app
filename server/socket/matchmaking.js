import { query } from '../db.js';

const DEFAULT_ELO = 1200;
const ELO_RANGE_INITIAL = 200;
const ELO_RANGE_RELAXATION_TIME = 10000; // 10 seconds
const MATCHMAKING_INTERVAL_MS = 2000;
const MATCHMAKING_BATCH_SIZE = 200;
const MATCHMAKING_IDLE_BACKOFF = 10000;
const MATCHMAKING_STALE_INTERVAL = "2 minutes";
const GAME_ID_RETRY_LIMIT = 5;

// Matchmaking service class
class MatchmakingService {
  constructor(io) {
    this.io = io;
    this.matchmakingInterval = null;
    this.matchmakingDelay = MATCHMAKING_INTERVAL_MS;
    this.isProcessing = false;
    this.startMatchmakingLoop();
  }

  startMatchmakingLoop() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }

    this.matchmakingInterval = setInterval(async () => {
      await this.processMatchmaking();
    }, this.matchmakingDelay);
  }

  updateMatchmakingInterval(hasMatches) {
    const nextDelay = hasMatches ? MATCHMAKING_INTERVAL_MS : MATCHMAKING_IDLE_BACKOFF;
    if (nextDelay === this.matchmakingDelay) return;
    this.matchmakingDelay = nextDelay;
    this.startMatchmakingLoop();
  }

  stopMatchmakingLoop() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }
  }

  isSocketActive(socketId) {
    if (!socketId) return false;
    return Boolean(this.io?.sockets?.sockets?.get(socketId));
  }

  generateGameId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let gameId = '';
    for (let i = 0; i < 6; i++) {
      gameId += chars[Math.floor(Math.random() * chars.length)];
    }
    return gameId;
  }

  async processMatchmaking() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      // Get all players in queue, ordered by joined_at
      const result = await query(
        `SELECT * FROM matchmaking_queue
         WHERE last_heartbeat > NOW() - INTERVAL '${MATCHMAKING_STALE_INTERVAL}'
         ORDER BY joined_at ASC
         LIMIT $1`,
        [MATCHMAKING_BATCH_SIZE]
      );

      const queue = result.rows;
      if (queue.length < 2) {
        this.updateMatchmakingInterval(false);
        return;
      }

      const matched = new Set();
      const stale = new Set();

      for (let i = 0; i < queue.length; i++) {
        if (matched.has(queue[i].id)) continue;

        const player1 = queue[i];
        if (!this.isSocketActive(player1.socket_id)) {
          stale.add(player1.id);
          continue;
        }

        const player1Elo = Number.isFinite(player1.elo) ? player1.elo : DEFAULT_ELO;
        const waitTime = Date.now() - new Date(player1.joined_at).getTime();
        const eloRange = waitTime > ELO_RANGE_RELAXATION_TIME ? Infinity : ELO_RANGE_INITIAL;

        // Find best match
        let bestMatch = null;
        let bestEloDiff = Infinity;

        for (let j = i + 1; j < queue.length; j++) {
          if (matched.has(queue[j].id)) continue;

          const player2 = queue[j];
          if (!this.isSocketActive(player2.socket_id)) {
            stale.add(player2.id);
            continue;
          }

          const player2Elo = Number.isFinite(player2.elo) ? player2.elo : DEFAULT_ELO;
          const eloDiff = Math.abs(player1Elo - player2Elo);

          // Check if both want ranked matches
          if (player1.is_ranked !== player2.is_ranked) continue;

          if (eloDiff <= eloRange && eloDiff < bestEloDiff) {
            bestMatch = player2;
            bestEloDiff = eloDiff;
          }
        }

        if (bestMatch) {
          const matchCreated = await this.createMatch(player1, bestMatch);
          if (matchCreated) {
            matched.add(player1.id);
            matched.add(bestMatch.id);
          }
        }
      }

      // Remove matched players from queue
      const idsToRemove = new Set([...matched, ...stale]);
      if (idsToRemove.size > 0) {
        const ids = Array.from(idsToRemove);
        await query(
          `DELETE FROM matchmaking_queue WHERE id = ANY($1)`,
          [ids]
        );
        this.updateMatchmakingInterval(matched.size > 0);
      } else {
        this.updateMatchmakingInterval(false);
      }
    } catch (error) {
      console.error('[Matchmaking] Error processing queue:', error);
      this.updateMatchmakingInterval(false);
    } finally {
      this.isProcessing = false;
    }
  }

  async createMatch(player1, player2) {
    try {
      if (!this.isSocketActive(player1.socket_id) || !this.isSocketActive(player2.socket_id)) {
        return false;
      }

      // Generate a unique game ID
      let gameId = this.generateGameId();
      let created = false;
      let attempt = 0;

      while (!created && attempt < GAME_ID_RETRY_LIMIT) {
        attempt += 1;
        try {
          // Randomly assign colors
          const isPlayer1White = Math.random() < 0.5;
          
          // Create active game in database
          await query(
            `INSERT INTO active_games (
              game_id, 
              white_player_id, black_player_id,
              white_socket_id, black_socket_id,
              white_player_name, black_player_name,
              white_elo, black_elo,
              status, game_mode
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              gameId,
              isPlayer1White ? player1.player_id : player2.player_id,
              isPlayer1White ? player2.player_id : player1.player_id,
              isPlayer1White ? player1.socket_id : player2.socket_id,
              isPlayer1White ? player2.socket_id : player1.socket_id,
              isPlayer1White ? player1.player_name : player2.player_name,
              isPlayer1White ? player2.player_name : player1.player_name,
              isPlayer1White ? player1.elo : player2.elo,
              isPlayer1White ? player2.elo : player1.elo,
              'playing',
              player1.is_ranked ? 'ranked' : 'friendly'
            ]
          );

          created = true;

          // Notify both players
          const matchData = {
            gameId,
            gameMode: player1.is_ranked ? 'ranked' : 'friendly',
            players: {
              white: {
                id: isPlayer1White ? player1.player_id : player2.player_id,
                name: isPlayer1White ? player1.player_name : player2.player_name,
                elo: isPlayer1White ? player1.elo : player2.elo
              },
              black: {
                id: isPlayer1White ? player2.player_id : player1.player_id,
                name: isPlayer1White ? player2.player_name : player1.player_name,
                elo: isPlayer1White ? player2.elo : player1.elo
              }
            }
          };

          this.io.to(player1.socket_id).emit('match_found', {
            ...matchData,
            yourColor: isPlayer1White ? 'white' : 'black',
            yourId: player1.player_id
          });

          this.io.to(player2.socket_id).emit('match_found', {
            ...matchData,
            yourColor: isPlayer1White ? 'black' : 'white',
            yourId: player2.player_id
          });

          console.log(`[Matchmaking] Created match ${gameId} between ${player1.player_name} (${player1.elo}) and ${player2.player_name} (${player2.elo})`);
        } catch (error) {
          if (error?.code === '23505') {
            gameId = this.generateGameId();
            continue;
          }
          throw error;
        }
      }

      return created;
    } catch (error) {
      console.error('[Matchmaking] Error creating match:', error);
      return false;
    }
  }

  async joinQueue(socketId, playerId, playerName, elo, isRanked = true) {
    try {
      const resolvedElo = Number.isFinite(elo) ? elo : DEFAULT_ELO;
      // Remove any existing entry for this socket or player to avoid duplicates on reconnect
      await query(
        'DELETE FROM matchmaking_queue WHERE socket_id = $1 OR player_id = $2',
        [socketId, playerId]
      );

      // Add to queue
      await query(
        `INSERT INTO matchmaking_queue (socket_id, player_id, player_name, elo, is_ranked)
         VALUES ($1, $2, $3, $4, $5)`,
        [socketId, playerId, playerName, resolvedElo, isRanked]
      );

      console.log(`[Matchmaking] Player ${playerName} (${resolvedElo}) joined queue`);
      return true;
    } catch (error) {
      console.error('[Matchmaking] Error joining queue:', error);
      return false;
    }
  }

  async leaveQueue(playerId) {
    try {
      const result = await query(
        'DELETE FROM matchmaking_queue WHERE player_id = $1 RETURNING *',
        [playerId]
      );

      if (result.rowCount > 0) {
        console.log(`[Matchmaking] Player ${result.rows[0].player_name} left queue`);
      }
      return true;
    } catch (error) {
      console.error('[Matchmaking] Error leaving queue:', error);
      return false;
    }
  }

  async updateHeartbeat(playerId) {
    try {
      await query(
        'UPDATE matchmaking_queue SET last_heartbeat = CURRENT_TIMESTAMP WHERE player_id = $1',
        [playerId]
      );
    } catch (error) {
      console.error('[Matchmaking] Error updating heartbeat:', error);
    }
  }

  async getQueueStatus() {
    try {
      const result = await query(
        `SELECT COUNT(*) as count FROM matchmaking_queue
         WHERE last_heartbeat > NOW() - INTERVAL '${MATCHMAKING_STALE_INTERVAL}'`
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('[Matchmaking] Error getting queue status:', error);
      return 0;
    }
  }

  async getQueueDetails() {
    try {
      // Get player count by rating ranges for visualization
      const result = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE elo < 1000) as below_1000,
          COUNT(*) FILTER (WHERE elo BETWEEN 1000 AND 1500) as range_1000_1500,
          COUNT(*) FILTER (WHERE elo BETWEEN 1500 AND 2000) as range_1500_2000,
          COUNT(*) FILTER (WHERE elo >= 2000) as above_2000
        FROM matchmaking_queue
        WHERE last_heartbeat > NOW() - INTERVAL '${MATCHMAKING_STALE_INTERVAL}'
      `);
      
      return {
        total: parseInt(result.rows[0].total, 10),
        distribution: {
          below_1000: parseInt(result.rows[0].below_1000, 10),
          range_1000_1500: parseInt(result.rows[0].range_1000_1500, 10),
          range_1500_2000: parseInt(result.rows[0].range_1500_2000, 10),
          above_2000: parseInt(result.rows[0].above_2000, 10)
        }
      };
    } catch (error) {
      console.error('[Matchmaking] Error getting queue details:', error);
      return { total: 0, distribution: {} };
    }
  }
}

// Export singleton instance
let matchmakingService = null;

export function getMatchmakingService(io) {
  if (!matchmakingService) {
    matchmakingService = new MatchmakingService(io);
  }
  return matchmakingService;
}

// Socket.io event handlers
export function setupMatchmakingHandlers(io, socket) {
  const service = getMatchmakingService(io);

  socket.on('join_matchmaking', async (data) => {
    // Validate input data
    const { playerId, playerName, elo, isRanked } = data;

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Invalid player ID'
      });
      return;
    }

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length < 2) {
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Invalid player name'
      });
      return;
    }

    const trimmedName = playerName.trim();

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Player name can only contain letters, numbers, and underscores'
      });
      return;
    }

    const parsedElo = Number(elo);
    const resolvedElo = Number.isFinite(parsedElo) ? parsedElo : DEFAULT_ELO;

    if (resolvedElo < 0 || resolvedElo > 4000) {
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Invalid ELO rating'
      });
      return;
    }

    if (typeof isRanked !== 'boolean') {
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Invalid rank preference'
      });
      return;
    }

    console.log(`[Socket] Player ${trimmedName} joining matchmaking`);

    try {
      const existingGame = await query(
        `SELECT game_id FROM active_games
         WHERE (white_player_id = $1 OR black_player_id = $1
           OR white_socket_id = $2 OR black_socket_id = $2)
         AND status IN ('playing', 'waiting')
         LIMIT 1`,
        [playerId, socket.id]
      );

      if (existingGame.rowCount > 0) {
        socket.emit('matchmaking_error', {
          message: 'You are already in an active game.'
        });
        socket.emit('matchmaking_status', {
          inQueue: false,
          message: 'Already in an active game'
        });
        return;
      }
    } catch (error) {
      console.error('[Matchmaking] Error checking active games:', error);
      socket.emit('matchmaking_error', {
        message: 'Unable to verify active game status.'
      });
      socket.emit('matchmaking_status', {
        inQueue: false,
        message: 'Failed to join matchmaking'
      });
      return;
    }

    const success = await service.joinQueue(
      socket.id,
      playerId,
      trimmedName,
      resolvedElo,
      isRanked
    );

    socket.emit('matchmaking_status', {
      inQueue: success,
      message: success ? 'Joined matchmaking queue' : 'Failed to join queue'
    });
  });

  socket.on('leave_matchmaking', async (data) => {
    const { playerId } = data;
    
    console.log(`[Socket] Player leaving matchmaking`);
    
    await service.leaveQueue(playerId);
    
    socket.emit('matchmaking_status', {
      inQueue: false,
      message: 'Left matchmaking queue'
    });
  });

  socket.on('matchmaking_heartbeat', async (data) => {
    const { playerId } = data;
    await service.updateHeartbeat(playerId);
  });

  socket.on('get_queue_status', async () => {
    const count = await service.getQueueStatus();
    socket.emit('queue_status', { playersInQueue: count });
  });

  socket.on('get_queue_details', async () => {
    const details = await service.getQueueDetails();
    socket.emit('queue_details', details);
  });
}

export { MatchmakingService };
