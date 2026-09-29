import { query, withTransaction } from '../db.js';
import { accountIdForPlayer, findActiveGameForAccount, lockAccounts } from './activeGameGuard.js';
import { TIME_CONTROL_IDS, initialClockMs, normalizeTimeControl } from './chessClock.js';

const DEFAULT_ELO = 1200;
const ELO_RANGE_INITIAL = 500; // Increased from 200 for better matching
const ELO_RANGE_RELAXATION_TIME = 10000; // 10 seconds
const MATCHMAKING_INTERVAL_MS = 2000;
const MATCHMAKING_BATCH_SIZE = 200;
const MATCHMAKING_IDLE_BACKOFF = 10000;

// Matchmaking service class. Pure HTTP/polling — there is no Socket.IO server
// anymore, so a created match is never pushed over a socket. Clients discover
// it by polling GET /api/matchmaking/check-match, which reads active_games.
class MatchmakingService {
  constructor(options = {}) {
    this.matchmakingInterval = null;
    this.matchmakingDelay = MATCHMAKING_INTERVAL_MS;
    this.enableLoop = options.enableLoop === true;
    this.isProcessing = false;
    if (this.enableLoop) {
      this.startMatchmakingLoop();
    }
  }

  startMatchmakingLoop() {
    if (!this.enableLoop) {
      return;
    }
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }

    this.matchmakingInterval = setInterval(async () => {
      await this.processMatchmaking();
    }, this.matchmakingDelay);
  }

  updateMatchmakingInterval(hasMatches) {
    if (!this.enableLoop) {
      return;
    }
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

  // Pools are isolated by time control: a player is only ever compared against
  // (and matched with) players queued for the same control. Each pool is read,
  // paired, and drained independently so a busy pool can never starve another.
  async processMatchmaking() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let totalMatched = 0;
      for (const timeControl of TIME_CONTROL_IDS) {
        totalMatched += await this.processPool(timeControl);
      }
      this.updateMatchmakingInterval(totalMatched > 0);

      console.log(`[Matchmaking] Cycle complete. Matched: ${totalMatched} across pools`);

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
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Pairs players inside a single time-control pool and returns how many were
   * matched. The SQL predicate mirrors `normalizeTimeControl` (unknown/NULL
   * values are untimed), and the app-side filter is a second guard so a stray
   * row can never cross pools.
   */
  async processPool(timeControl) {
    const result = await query(
      `SELECT * FROM matchmaking_queue
       WHERE COALESCE(NULLIF(time_control, ''), 'unlimited') = $1
         AND last_heartbeat > NOW() - INTERVAL '45 seconds'
       ORDER BY joined_at ASC
       LIMIT $2`,
      [timeControl, MATCHMAKING_BATCH_SIZE]
    );

    const queue = result.rows.filter(
      (p) => normalizeTimeControl(p.time_control) === timeControl
    );

    if (queue.length > 0) {
      console.log(`[Matchmaking/${timeControl}] Processing pool: ${queue.length} player(s) waiting`);
      console.log(`[Matchmaking/${timeControl}] Pool details:`, queue.map(p => ({
        name: p.player_name,
        elo: p.elo,
        is_ranked: p.is_ranked,
        socket_id: p.socket_id,
        player_id: p.player_id
      })));
    }
    if (queue.length < 2) {
      console.log(`[Matchmaking/${timeControl}] Need at least 2 players (current: ${queue.length}), skipping pairing`);
      return 0;
    }

    const matched = new Set();
    const now = Date.now();

    for (let i = 0; i < queue.length; i++) {
      if (matched.has(queue[i].id)) continue;

      const player1 = queue[i];
      const waitTime = now - new Date(player1.joined_at).getTime();
      const eloRange = waitTime > ELO_RANGE_RELAXATION_TIME ? Infinity : ELO_RANGE_INITIAL;

      console.log(`[Matchmaking/${timeControl}] Checking ${player1.player_name} (elo=${player1.elo}, ranked=${player1.is_ranked}, wait=${Math.floor(waitTime/1000)}s, range=${eloRange === Infinity ? '∞' : eloRange})`);

      // Find best match
      let bestMatch = null;
      let bestEloDiff = Infinity;

      for (let j = i + 1; j < queue.length; j++) {
        if (matched.has(queue[j].id)) continue;

        const player2 = queue[j];
        const eloDiff = Math.abs(player1.elo - player2.elo);

        // Check if both want ranked matches
        if (player1.is_ranked !== player2.is_ranked) {
          console.log(`[Matchmaking/${timeControl}]   Skipped ${player2.player_name}: is_ranked mismatch (${player1.is_ranked} vs ${player2.is_ranked})`);
          continue;
        }

        // Timed and untimed games are never paired against each other. A pool
        // already shares one control; this stays as a defensive guard.
        const player1Control = normalizeTimeControl(player1.time_control);
        const player2Control = normalizeTimeControl(player2.time_control);
        if (player1Control !== player2Control) {
          console.log(`[Matchmaking/${timeControl}]   Skipped ${player2.player_name}: time_control mismatch (${player1Control} vs ${player2Control})`);
          continue;
        }

        if (eloDiff <= eloRange && eloDiff < bestEloDiff) {
          console.log(`[Matchmaking/${timeControl}]   Potential match with ${player2.player_name}: elo diff=${eloDiff} ✓`);
          bestMatch = player2;
          bestEloDiff = eloDiff;
        } else {
          console.log(`[Matchmaking/${timeControl}]   Skipped ${player2.player_name}: elo diff=${eloDiff} > range=${eloRange}`);
        }
      }

      if (bestMatch) {
        console.log(`[Matchmaking/${timeControl}] ✅ Pairing found: ${player1.player_name}(${player1.elo}) vs ${bestMatch.player_name}(${bestMatch.elo}), elo diff=${bestEloDiff}, ranked=${player1.is_ranked}`);

        if (await this.createMatch(player1, bestMatch)) {
          matched.add(player1.id);
          matched.add(bestMatch.id);
        } else {
          console.error('[Matchmaking] Failed to create match, skipping removal from queue');
        }
      } else {
        console.log(`[Matchmaking/${timeControl}] No match found for ${player1.player_name}`);
      }
    }

    // Remove matched players from this pool only
    if (matched.size > 0) {
      const ids = Array.from(matched);
      await query(
        `DELETE FROM matchmaking_queue WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`[Matchmaking/${timeControl}] Removed ${matched.size} matched players from pool`);
    } else {
      console.log(`[Matchmaking/${timeControl}] No pairs found this cycle (${queue.length} players in pool)`);
    }

    return matched.size;
  }

  async createMatch(player1, player2) {
    try {
      return await withTransaction(async (client) => {
        const player1Account = accountIdForPlayer(player1.player_id);
        const player2Account = accountIdForPlayer(player2.player_id);
        if (!player1Account || player1Account === player2Account) {
          console.warn('[Matchmaking] Refusing to match an account against itself');
          return false;
        }

        await lockAccounts(client, [player1.player_id, player2.player_id]);

        // Re-check both the queue and active-game state after acquiring the
        // account locks. This is the authoritative race-safe gate.
        const check = await client.query(
          'SELECT count(*) FROM matchmaking_queue WHERE player_id IN ($1, $2)',
          [player1.player_id, player2.player_id]
        );
        if (parseInt(check.rows[0].count, 10) !== 2) {
          console.warn('[Matchmaking] Players left queue before match creation');
          return false;
        }

        const player1ActiveGame = await findActiveGameForAccount(client, player1.player_id);
        const player2ActiveGame = await findActiveGameForAccount(client, player2.player_id);
        if (player1ActiveGame || player2ActiveGame) {
          console.warn('[Matchmaking] Refusing to create a second active game for an account');
          return false;
        }

        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let gameId = '';
        for (let i = 0; i < 6; i++) {
          gameId += chars[Math.floor(Math.random() * chars.length)];
        }

        const isPlayer1White = Math.random() < 0.5;
        // Matchmaking starts the game immediately, so a timed game's clock
        // begins running for White as soon as the match row is written.
        const timeControl = normalizeTimeControl(player1.time_control);
        const startingMs = initialClockMs(timeControl);
        await client.query(
          `INSERT INTO active_games (
            game_id,
            white_player_id, black_player_id,
            white_socket_id, black_socket_id,
            white_player_name, black_player_name,
            white_elo, black_elo,
            status, game_mode,
            time_control, white_time_ms, black_time_ms, clock_running_since
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
            player1.is_ranked ? 'ranked' : 'friendly',
            timeControl,
            startingMs,
            startingMs,
            timeControl === 'rapid' ? new Date() : null
          ]
        );

        console.log(`[Matchmaking] Game ${gameId} inserted into active_games (mode=${player1.is_ranked ? 'ranked' : 'friendly'}, time=${timeControl})`);
        console.log(`[Matchmaking]   Match discovered by HTTP polling via GET /api/matchmaking/check-match`);
        return true;
      });
    } catch (error) {
      console.error('[Matchmaking] Error creating match:', error);
      return false;
    }
  }

  async joinQueue(socketId, playerId, playerName, elo, isRanked = true, timeControl = 'unlimited') {
    try {
      // Remove any existing entry for this socket or player to avoid duplicates on reconnect
      await query(
        'DELETE FROM matchmaking_queue WHERE socket_id = $1 OR player_id = $2',
        [socketId, playerId]
      );

      // Add to queue
      await query(
        `INSERT INTO matchmaking_queue (socket_id, player_id, player_name, elo, is_ranked, time_control)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [socketId, playerId, playerName, Number.isFinite(Number(elo)) ? Number(elo) : DEFAULT_ELO, isRanked, normalizeTimeControl(timeControl)]
      );

      console.log(`[Matchmaking] Player ${playerName} (${elo}) joined queue`);
      
      this.updateMatchmakingInterval(true);
      
      setImmediate(() => this.processMatchmaking());

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

// One-at-a-time processing for HTTP join/heartbeat triggers. No Socket.IO
// server exists anymore, so no io reference is required.
export async function processMatchmakingOnce() {
  const service = new MatchmakingService({ enableLoop: false });
  await service.processMatchmaking();
}

export { MatchmakingService };