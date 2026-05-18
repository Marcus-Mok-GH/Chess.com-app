import { getDirectPool, getPool, shouldClosePool } from './pool.js';

export async function initDatabase() {
  const pool = getDirectPool();
  const isDuplicateTypeError = (error) =>
    error?.code === '23505' && error?.constraint === 'pg_type_typname_nsp_index';

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const client = await pool.connect();
  try {
    const runInit = async () => {
      // Check if we need to perform the migration/reset.
      // We check if any of the legacy integer columns still exist.
      // If they do, we need to reset them to VARCHAR to match the new schema.
      let needsReset = false;
      const detectedMismatches = [];
      try {
        const typeCheck = await client.query(`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE (table_name = 'users' AND column_name = 'id')
             OR (table_name = 'games' AND column_name = 'white_player_id')
             OR (table_name = 'games' AND column_name = 'black_player_id')
             OR (table_name = 'user_settings' AND column_name = 'user_id')
             OR (table_name = 'elo_history' AND column_name = 'user_id')
        `);
        for (const row of typeCheck.rows) {
          if (row.data_type === 'integer') {
            needsReset = true;
            detectedMismatches.push(`${row.table_name}.${row.column_name}`);
          }
        }
      } catch (e) {
        // If table doesn't exist, we don't need to reset, CREATE TABLE IF NOT EXISTS will handle it.
      }

      await client.query('BEGIN');
      try {
        if (needsReset) {
          if (process.env.FORCE_DB_RESET !== 'true') {
            console.error('[DB] CRITICAL: Schema mismatch detected in the following columns:');
            console.error(`[DB] ${detectedMismatches.join(', ')}`);
            console.error('[DB] Database reset is required but FORCE_DB_RESET flag is not set.');
            console.error('[DB] Please back up your data and set FORCE_DB_RESET=true to proceed.');
            console.error('[DB] ABORTING to prevent data loss.');
            throw new Error('Schema mismatch detected but FORCE_DB_RESET not authorized');
          }
          console.warn(`[DB] FORCE_DB_RESET authorized. Resetting tables with mismatched columns: ${detectedMismatches.join(', ')}`);
          await client.query(`
            DROP TABLE IF EXISTS elo_history CASCADE;
            DROP TABLE IF EXISTS match_moves CASCADE;
            DROP TABLE IF EXISTS user_settings CASCADE;
            DROP TABLE IF EXISTS games CASCADE;
            DROP TABLE IF EXISTS active_games CASCADE;
            DROP TABLE IF EXISTS matchmaking_queue CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
          `);
        }

        // Ensure UUID extension is available
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
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
            white_player_id VARCHAR(100) REFERENCES users(id),
            black_player_id VARCHAR(100) REFERENCES users(id),
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
            user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
            user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
