import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(20) UNIQUE NOT NULL,
        elo INTEGER DEFAULT 1200,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        game_code VARCHAR(10) UNIQUE NOT NULL,
        white_player_id INTEGER REFERENCES users(id),
        black_player_id INTEGER REFERENCES users(id),
        white_player_name VARCHAR(20),
        black_player_name VARCHAR(20),
        result VARCHAR(10),
        game_mode VARCHAR(20) DEFAULT 'friendly',
        fen TEXT,
        move_history TEXT[],
        status VARCHAR(20) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_games_code ON games(game_code)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)
    `);

    // Matchmaking queue table for real-time multiplayer
    await client.query(`
      CREATE TABLE IF NOT EXISTS matchmaking_queue (
        id SERIAL PRIMARY KEY,
        socket_id VARCHAR(100) NOT NULL,
        player_id VARCHAR(100) NOT NULL,
        player_name VARCHAR(50) NOT NULL,
        elo INTEGER DEFAULT 1200,
        is_ranked BOOLEAN DEFAULT true,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matchmaking_player_id ON matchmaking_queue(player_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matchmaking_elo ON matchmaking_queue(elo)
    `);

    // Active games table for real-time games
    await client.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        id SERIAL PRIMARY KEY,
        game_id VARCHAR(20) UNIQUE NOT NULL,
        white_player_id VARCHAR(100),
        black_player_id VARCHAR(100),
        white_socket_id VARCHAR(100),
        black_socket_id VARCHAR(100),
        white_player_name VARCHAR(50),
        black_player_name VARCHAR(50),
        white_elo INTEGER,
        black_elo INTEGER,
        fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        move_history TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'waiting',
        game_mode VARCHAR(20) DEFAULT 'ranked',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS match_moves (
        game_id VARCHAR(20) NOT NULL,
        username VARCHAR(20) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        move_history TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (game_id, username)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_active_games_game_id ON active_games(game_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_active_games_status ON active_games(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_match_moves_game_id ON match_moves(game_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_match_moves_username ON match_moves(username)
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Cleanup stale matchmaking entries (older than 2 minutes)
export async function cleanupStaleMatchmakingEntries() {
  try {
    const result = await query(
      `DELETE FROM matchmaking_queue 
       WHERE last_heartbeat < NOW() - INTERVAL '2 minutes'
       RETURNING id`
    );
    if (result.rowCount > 0) {
      console.log(`[DB] Cleaned up ${result.rowCount} stale matchmaking entries`);
    }
  } catch (error) {
    console.error('[DB] Error cleaning up matchmaking entries:', error);
  }
}

// Cleanup old active games (older than 24 hours)
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

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
  return res;
}

export default pool;
