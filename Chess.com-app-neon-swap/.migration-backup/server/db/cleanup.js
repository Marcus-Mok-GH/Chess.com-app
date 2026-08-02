import query from './query.js';

export async function cleanupStaleMatchmakingEntries() {
  try {
    const result = await query(
      `DELETE FROM matchmaking_queue
       WHERE last_heartbeat < NOW() - INTERVAL '45 seconds'
       RETURNING id`
    );
    if (result.rowCount > 0) {
      console.log(`[DB] Cleaned up ${result.rowCount} stale matchmaking entries`);
    }
  } catch (error) {
    console.error('[DB] Error cleaning up matchmaking entries:', error);
  }
}

export async function cleanupOldActiveGames() {
  try {
    const result = await query(
      `DELETE FROM active_games
       WHERE updated_at < NOW() - INTERVAL '24 hours'
       OR status = 'ended'
       RETURNING id`
    );
    if (result.rowCount > 0) {
      console.log(`[DB] Cleaned up ${result.rowCount} old active games`);
    }
  } catch (error) {
    console.error('[DB] Error cleaning up active games:', error);
  }
}
