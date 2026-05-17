import { getDirectPool, getPool, shouldClosePool } from './pool.js';

export async function initDatabase() {
  const pool = getDirectPool();
  const isDuplicateTypeError = (error) =>
    error?.code === '23505' && error?.constraint === 'pg_type_typname_nsp_index';

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const client = await pool.connect();
  try {
    const runInit = async () => {
      await client.query('BEGIN');
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

        await client.query(`
          CREATE TABLE IF NOT EXISTS elo_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            elo INTEGER NOT NULL,
            change INTEGER NOT NULL DEFAULT 0,
            game_code VARCHAR(20),
            game_mode VARCHAR(20) DEFAULT 'ranked',
            opponent_elo INTEGER,
            result VARCHAR(10),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_elo_history_user_id ON elo_history(user_id)
        `);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await runInit();
        console.log('Database schema ensured');
        break;
      } catch (error) {
        if (isDuplicateTypeError(error) && attempt < 2) {
          console.warn('[DB] Detected concurrent init, retrying...');
          await delay(200);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

export async function checkDatabaseConnection() {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error.message);
    return false;
  } finally {
    if (shouldClosePool) {
      await pool.end();
    }
  }
}
