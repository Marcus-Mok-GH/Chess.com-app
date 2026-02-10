import { query } from '../db.js';

const DEFAULT_ELO = 1200;
const ELO_RANGE_INITIAL = 200;
const ELO_RANGE_RELAXATION_TIME = 10000; // 10 seconds
const MATCHMAKING_INTERVAL_MS = 2000;
const MATCHMAKING_BATCH_SIZE = 200;
const MATCHMAKING_IDLE_BACKOFF = 10000;

// Matchmaking service class
class MatchmakingService {
  constructor(io) {
    this.io = io;
    this.matchmakingInterval = null;
    this.matchmakingDelay = MATCHMAKING_INTERVAL_MS;
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

  async processMatchmaking() {
    try {
      // Get all players in queue, ordered by joined_at
      const result = await query(
        `SELECT * FROM matchmaking_queue
         WHERE last_heartbeat > NOW() - INTERVAL '45 seconds'
         ORDER BY joined_at ASC
         LIMIT $1`,
        [MATCHMAKING_BATCH_SIZE]
      );

      const queue = result.rows;
      if (queue.length > 0) {
        console.log(`[Matchmaking] Processing queue: ${queue.length} player(s) waiting`, queue.map(p => `${p.player_name}(${p.elo})`).join(', '));
      }
      if (queue.length < 2) {
        this.updateMatchmakingInterval(false);
        return;
      }

      const matched = new Set();

      for (let i = 0; i < queue.length; i++) {
        if (matched.has(queue[i].id)) continue;

        const player1 = queue[i];
        const waitTime = Date.now() - new Date(player1.joined_at).getTime();
        const eloRange = waitTime > ELO_RANGE_RELAXATION_TIME ? Infinity : ELO_RANGE_INITIAL;

        // Find best match
        let bestMatch = null;
        let bestEloDiff = Infinity;

        for (let j = i + 1; j < queue.length; j++) {
          if (matched.has(queue[j].id)) continue;

          const player2 = queue[j];
          const eloDiff = Math.abs(player1.elo - player2.elo);

          // Check if both want ranked matches
          if (player1.is_ranked !== player2.is_ranked) continue;

          if (eloDiff <= eloRange && eloDiff < bestEloDiff) {
            bestMatch = player2;
            bestEloDiff = eloDiff;
          }
        }

        if (bestMatch) {
          console.log(`[Matchmaking] Pairing found: ${player1.player_name}(${player1.elo}) vs ${bestMatch.player_name}(${bestMatch.elo}), elo diff=${bestEloDiff}, ranked=${player1.is_ranked}`);
          matched.add(player1.id);
          matched.add(bestMatch.id);
          await this.createMatch(player1, bestMatch);
        }
      }

      // Remove matched players from queue
      if (matched.size > 0) {
        const ids = Array.from(matched);
        await query(
          `DELETE FROM matchmaking_queue WHERE id = ANY($1)`,
          [ids]
        );
        console.log(`[Matchmaking] Removed ${matched.size} matched players from queue`);
        this.updateMatchmakingInterval(true);
      } else {
        console.log(`[Matchmaking] No pairs found this cycle (${queue.length} players in queue)`);
        this.updateMatchmakingInterval(false);
      }
      
      // Also remove stale entries that may have expired during this cycle
      const staleResult = await query(
        `DELETE FROM matchmaking_queue
         WHERE last_heartbeat < NOW() - INTERVAL '45 seconds'
         RETURNING player_name`
      );
      if (staleResult.rowCount > 0) {
        console.log(`[Matchmaking] Removed ${staleResult.rowCount} stale entries during processing`);
      }
    } catch (error) {
      console.error('[Matchmaking] Error processing queue:', error);
      this.updateMatchmakingInterval(false);
    }
  }

  async createMatch(player1, player2) {
    try {
      // Generate a unique game ID
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let gameId = '';
      for (let i = 0; i < 6; i++) {
        gameId += chars[Math.floor(Math.random() * chars.length)];
      }

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

      // Notify both players via Socket.IO (only works for socket-connected players)
      // Polling-based players will discover the match via HTTP polling
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

      console.log(`[Matchmaking] Game ${gameId} inserted into active_games (mode=${player1.is_ranked ? 'ranked' : 'friendly'})`);
      console.log(`[Matchmaking]   White: ${matchData.players.white.name} (${matchData.players.white.elo}) id=${matchData.players.white.id}`);
      console.log(`[Matchmaking]   Black: ${matchData.players.black.name} (${matchData.players.black.elo}) id=${matchData.players.black.id}`);

      // Only emit to players if their socket_id doesn't start with 'polling-'
      // (polling-based players don't have active socket connections)
      if (!player1.socket_id.startsWith('polling-')) {
        console.log(`[Matchmaking] Emitting match_found to ${player1.player_name} via socket ${player1.socket_id} (color=${isPlayer1White ? 'white' : 'black'})`);
        this.io.to(player1.socket_id).emit('match_found', {
          ...matchData,
          yourColor: isPlayer1White ? 'white' : 'black',
          yourId: player1.player_id
        });
      } else {
        console.log(`[Matchmaking] ${player1.player_name} is polling-based (${player1.socket_id}), skipping socket emit`);
      }
      if (!player2.socket_id.startsWith('polling-')) {
        console.log(`[Matchmaking] Emitting match_found to ${player2.player_name} via socket ${player2.socket_id} (color=${isPlayer1White ? 'black' : 'white'})`);
        this.io.to(player2.socket_id).emit('match_found', {
          ...matchData,
          yourColor: isPlayer1White ? 'black' : 'white',
          yourId: player2.player_id
        });
      } else {
        console.log(`[Matchmaking] ${player2.player_name} is polling-based (${player2.socket_id}), skipping socket emit`);
      }

      console.log(`[Matchmaking] ✅ Match ${gameId} fully created and events emitted`);
    } catch (error) {
      console.error('[Matchmaking] Error creating match:', error);
    }
  }

  async joinQueue(socketId, playerId, playerName, elo, isRanked = true) {
    try {
      // Remove any existing entry for this socket or player to avoid duplicates on reconnect
      await query(
        'DELETE FROM matchmaking_queue WHERE socket_id = $1 OR player_id = $2',
        [socketId, playerId]
      );

      // Add to queue
      await query(
        `INSERT INTO matchmaking_queue (socket_id, player_id, player_name, elo, is_ranked)
         VALUES ($1, $2, $3, $4, $5)`,
        [socketId, playerId, playerName, elo || DEFAULT_ELO, isRanked]
      );

      console.log(`[Matchmaking] Player ${playerName} (${elo}) joined queue`);
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
      const result = await query('SELECT COUNT(*) as count FROM matchmaking_queue');
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

    if (typeof elo !== 'number' || elo < 0 || elo > 4000) {
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
      elo,
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
