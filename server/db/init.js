import { getDirectPool, getPool, shouldClosePool } from './pool.js';

export async function initDatabase() {
  const pool = getDirectPool();
  const isDuplicateTypeError = (error) =>
    error?.code === '23505' && error?.constraint === 'pg_type_typname_nsp_index';

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const runInitWithRetry = async () => {
    const maxAttempts = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');

        try {
          // Ensure UUID extension is available
          await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

          // Migration: Convert existing users table if needed
          // First, check if users table exists
          const tableExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = 'users'
            )
          `);

          if (tableExists.rows[0].exists) {
            // Add missing columns to existing users table
            await client.query(`
              DO $$
              BEGIN
                -- Add emailVerified if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='emailVerified') THEN
                  ALTER TABLE users ADD COLUMN "emailVerified" BOOLEAN DEFAULT FALSE;
                END IF;

                -- Add createdAt if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='createdAt') THEN
                  ALTER TABLE users ADD COLUMN "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                -- Add updatedAt if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='updatedAt') THEN
                  ALTER TABLE users ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                -- Add username if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
                  ALTER TABLE users ADD COLUMN username VARCHAR(20) UNIQUE;
                END IF;

                -- Add name if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='name') THEN
                  ALTER TABLE users ADD COLUMN name TEXT;
                END IF;

                -- Add email if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email') THEN
                  ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
                END IF;

                -- Add image if missing
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='image') THEN
                  ALTER TABLE users ADD COLUMN image TEXT;
                END IF;

                -- Convert id column from UUID to TEXT if needed
                IF EXISTS (
                  SELECT 1 FROM information_schema.columns
                  WHERE table_name='users' AND column_name='id' AND data_type='uuid'
                ) THEN
                  -- Add temporary text column
                  ALTER TABLE users ADD COLUMN id_text TEXT;
                  -- Backfill with UUID cast to text
                  UPDATE users SET id_text = id::text;
                  -- Drop old primary key constraint
                  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
                  -- Drop old id column
                  ALTER TABLE users DROP COLUMN id;
                  -- Rename id_text to id
                  ALTER TABLE users RENAME COLUMN id_text TO id;
                  -- Recreate primary key
                  ALTER TABLE users ADD PRIMARY KEY (id);
                END IF;
              END $$;
            `);
          }

          // Combined users table aligned with Better Auth standard schema
          await client.query(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT UNIQUE NOT NULL,
              "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
              image TEXT,
              username VARCHAR(20) UNIQUE,
              elo INTEGER DEFAULT 1200,
              games_played INTEGER DEFAULT 0,
              wins INTEGER DEFAULT 0,
              losses INTEGER DEFAULT 0,
              draws INTEGER DEFAULT 0,
              "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Better Auth Tables
          // Migration: Update sessions table if needed
          const sessionsExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = 'sessions'
            )
          `);

          if (sessionsExists.rows[0].exists) {
            await client.query(`
              DO $$
              BEGIN
                -- Add missing columns to sessions
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='userId') THEN
                  ALTER TABLE sessions ADD COLUMN "userId" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='token') THEN
                  ALTER TABLE sessions ADD COLUMN token TEXT UNIQUE;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='expiresAt') THEN
                  ALTER TABLE sessions ADD COLUMN "expiresAt" TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='ipAddress') THEN
                  ALTER TABLE sessions ADD COLUMN "ipAddress" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='userAgent') THEN
                  ALTER TABLE sessions ADD COLUMN "userAgent" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='createdAt') THEN
                  ALTER TABLE sessions ADD COLUMN "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='updatedAt') THEN
                  ALTER TABLE sessions ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                -- Add foreign key constraint if it doesn't exist
                IF NOT EXISTS (
                  SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_name = 'fk_sessions_user'
                  AND table_name = 'sessions'
                ) THEN
                  ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE;
                END IF;
              END $$;
            `);
          }

          await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              token TEXT UNIQUE NOT NULL,
              "expiresAt" TIMESTAMP NOT NULL,
              "ipAddress" TEXT,
              "userAgent" TEXT,
              "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Migration: Update accounts table if needed
          const accountsExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = 'accounts'
            )
          `);

          if (accountsExists.rows[0].exists) {
            await client.query(`
              DO $$
              BEGIN
                -- Add missing columns to accounts
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='userId') THEN
                  ALTER TABLE accounts ADD COLUMN "userId" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='accountId') THEN
                  ALTER TABLE accounts ADD COLUMN "accountId" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='providerId') THEN
                  ALTER TABLE accounts ADD COLUMN "providerId" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='accessToken') THEN
                  ALTER TABLE accounts ADD COLUMN "accessToken" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='refreshToken') THEN
                  ALTER TABLE accounts ADD COLUMN "refreshToken" TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='accessTokenExpiresAt') THEN
                  ALTER TABLE accounts ADD COLUMN "accessTokenExpiresAt" TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='refreshTokenExpiresAt') THEN
                  ALTER TABLE accounts ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='scope') THEN
                  ALTER TABLE accounts ADD COLUMN scope TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='password') THEN
                  ALTER TABLE accounts ADD COLUMN password TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='createdAt') THEN
                  ALTER TABLE accounts ADD COLUMN "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='updatedAt') THEN
                  ALTER TABLE accounts ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                -- Add foreign key constraint if it doesn't exist
                IF NOT EXISTS (
                  SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_name = 'fk_accounts_user'
                  AND table_name = 'accounts'
                ) THEN
                  ALTER TABLE accounts ADD CONSTRAINT fk_accounts_user FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE;
                END IF;
              END $$;
            `);
          }

          await client.query(`
            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY,
              "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              "accountId" TEXT NOT NULL,
              "providerId" TEXT NOT NULL,
              "accessToken" TEXT,
              "refreshToken" TEXT,
              "accessTokenExpiresAt" TIMESTAMP,
              "refreshTokenExpiresAt" TIMESTAMP,
              scope TEXT,
              password TEXT,
              "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Migration: Update verifications table if needed
          const verificationsExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = 'verifications'
            )
          `);

          if (verificationsExists.rows[0].exists) {
            await client.query(`
              DO $$
              BEGIN
                -- Add missing columns to verifications
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verifications' AND column_name='identifier') THEN
                  ALTER TABLE verifications ADD COLUMN identifier TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verifications' AND column_name='value') THEN
                  ALTER TABLE verifications ADD COLUMN value TEXT;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verifications' AND column_name='expiresAt') THEN
                  ALTER TABLE verifications ADD COLUMN "expiresAt" TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verifications' AND column_name='createdAt') THEN
                  ALTER TABLE verifications ADD COLUMN "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verifications' AND column_name='updatedAt') THEN
                  ALTER TABLE verifications ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
              END $$;
            `);
          }

          await client.query(`
            CREATE TABLE IF NOT EXISTS verifications (
              id TEXT PRIMARY KEY,
              identifier TEXT NOT NULL,
              value TEXT NOT NULL,
              "expiresAt" TIMESTAMP NOT NULL,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // App Specific Tables
          await client.query(`
            CREATE TABLE IF NOT EXISTS games (
              id SERIAL PRIMARY KEY,
              game_code VARCHAR(10) UNIQUE NOT NULL,
              white_player_id TEXT REFERENCES users(id),
              black_player_id TEXT REFERENCES users(id),
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
              user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
              player_id TEXT NOT NULL,
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
              white_player_id TEXT,
              black_player_id TEXT,
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
              username VARCHAR(20) NOT NULL,
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
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
          console.log('Database schema ensured');
          return; // Success
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        lastError = error;
        const isTransient = isDuplicateTypeError(error) || error.message.includes('timeout') || error.message.includes('terminated');
        if (isTransient && attempt < maxAttempts) {
          const waitTime = attempt * 1000;
          console.warn(`[DB] Database init attempt ${attempt} failed: ${error.message}. Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };

  try {
    await runInitWithRetry();
  } catch (error) {
    console.error('Error initializing database after retries:', error);
    throw error;
  } finally {
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

export async function checkDatabaseConnection() {
  const pool = getPool();
  try {
    if (!pool) return false;
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error.message);
    return false;
  } finally {
    if (shouldClosePool && pool) {
      await pool.end();
    }
  }
}
