import { getDirectPool, getPool, shouldClosePool } from './pool.js';
import { LESSON_CATALOG } from '../lessons/lessonCatalog.js';

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
        // Ensure UUID extension is available
        await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

        // Users table
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            username VARCHAR(20) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE,
            email_verified BOOLEAN DEFAULT FALSE,
            image TEXT,
            elo INTEGER DEFAULT 1200,
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Ensure missing columns in users if it existed before
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT');
        
        // Games table
        await client.query(`
          CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            game_code VARCHAR(20) UNIQUE NOT NULL,
            white_player_id VARCHAR(100) REFERENCES users(id),
            black_player_id VARCHAR(100) REFERENCES users(id),
            white_player_name VARCHAR(50),
            black_player_name VARCHAR(50),
            result VARCHAR(10),
            game_mode VARCHAR(20) DEFAULT 'friendly',
            fen TEXT,
            move_history TEXT[],
            status VARCHAR(20) DEFAULT 'waiting',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Keep existing installations compatible with the current games schema.
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS game_code VARCHAR(20)');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS white_player_id VARCHAR(100)');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS black_player_id VARCHAR(100)');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS white_player_name VARCHAR(50)');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS black_player_name VARCHAR(50)');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS result VARCHAR(10)');
        await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'friendly'");
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS fen TEXT');
        await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS move_history TEXT[] DEFAULT '{}'");
        await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'waiting'");
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query('ALTER TABLE games ALTER COLUMN game_code TYPE VARCHAR(20)');

        // User settings table
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_settings (
            user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            settings JSONB DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Sessions table
        await client.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(100) PRIMARY KEY,
            user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(100) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            ip_address VARCHAR(100),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Accounts table (Better Auth/Neon Auth requirements)
        await client.query(`
          CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            access_token TEXT,
            refresh_token TEXT,
            access_token_expires_at TIMESTAMP,
            refresh_token_expires_at TIMESTAMP,
            scope TEXT,
            password TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // OTP verifications (native email-OTP flow)
        await client.query(`
          CREATE TABLE IF NOT EXISTS verifications (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            identifier VARCHAR(255) NOT NULL,
            code_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            value TEXT,
            expires_at TIMESTAMP NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            consumed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS identifier VARCHAR(255)');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS code_hash TEXT');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS salt TEXT');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP');
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        // Self-heal: earlier deploys created the `verifications` table without a
        // DEFAULT on `id`, which makes the OTP `INSERT` fail with
        // "null value in column 'id' violates not-null constraint".
        // CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so the
        // default never gets backfilled. This ALTER is idempotent and safe to
        // run on every cold start.
        await client.query('ALTER TABLE verifications ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT');
        // Self-heal: the table may have been provisioned by Better Auth with a
        // `value TEXT NOT NULL` column. We don't read `value` (the OTP code lives
        // in `code_hash` + `salt`), but the constraint still rejects INSERTs that
        // omit it. Add the column if missing so the OTP flow works on every
        // existing install. The route supplies the literal `'native-email-otp'`.
        await client.query('ALTER TABLE verifications ADD COLUMN IF NOT EXISTS value TEXT');
        await client.query('CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_verifications_expires_at ON verifications(expires_at)');

        // Other tables
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
            result VARCHAR(20),
            fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            move_history TEXT[] DEFAULT '{}',
            status VARCHAR(20) DEFAULT 'waiting',
            game_mode VARCHAR(20) DEFAULT 'ranked',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Keep active game recovery tables self-healing if they were created by an older deploy.
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS game_id VARCHAR(20)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS white_player_id VARCHAR(100)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS black_player_id VARCHAR(100)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS white_socket_id VARCHAR(100)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS black_socket_id VARCHAR(100)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS white_player_name VARCHAR(50)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS black_player_name VARCHAR(50)');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS white_elo INTEGER');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS black_elo INTEGER');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS result VARCHAR(20)');
        await client.query("ALTER TABLE active_games ADD COLUMN IF NOT EXISTS fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'");
        await client.query("ALTER TABLE active_games ADD COLUMN IF NOT EXISTS move_history TEXT[] DEFAULT '{}'");
        await client.query("ALTER TABLE active_games ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'waiting'");
        await client.query("ALTER TABLE active_games ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'ranked'");
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query('ALTER TABLE active_games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query("ALTER TABLE active_games ADD COLUMN IF NOT EXISTS move_count INTEGER DEFAULT 0");

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

        await client.query('ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS game_id VARCHAR(20)');
        await client.query('ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS username VARCHAR(20)');
        await client.query("ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS move_history TEXT[] DEFAULT '{}'");
        await client.query('ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query('ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

        // Opening explorer book positions
        await client.query(`
          CREATE TABLE IF NOT EXISTS openings (
            id VARCHAR(255) PRIMARY KEY,
            eco VARCHAR(10),
            name VARCHAR(255),
            fen TEXT,
            move_san VARCHAR(10),
            parent_fen TEXT,
            moves_count INTEGER DEFAULT 0,
            white_wins INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            black_wins INTEGER DEFAULT 0,
            pgn TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Self-heal columns for openings tables created by earlier deploys.
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS id VARCHAR(255)');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS eco VARCHAR(10)');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS fen TEXT');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS move_san VARCHAR(10)');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS parent_fen TEXT');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS moves_count INTEGER DEFAULT 0');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS white_wins INTEGER DEFAULT 0');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS draws INTEGER DEFAULT 0');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS black_wins INTEGER DEFAULT 0');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS pgn TEXT');
        await client.query('ALTER TABLE openings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_openings_fen ON openings(fen)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_openings_parent_fen ON openings(parent_fen)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_openings_eco ON openings(eco)');

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

        // Pollinations BYOP OAuth state and encrypted delegated keys.
        await client.query(`
          CREATE TABLE IF NOT EXISTS pollinations_oauth_states (
            state VARCHAR(200) PRIMARY KEY,
            user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code_verifier TEXT NOT NULL,
            redirect_uri TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS pollinations_coach_tokens (
            user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            encrypted_token TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            scope TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_pollinations_oauth_states_expires_at ON pollinations_oauth_states(expires_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_pollinations_coach_tokens_expires_at ON pollinations_coach_tokens(expires_at)');

        // Lessons (curated learning content)
        await client.query(`
          CREATE TABLE IF NOT EXISTS lessons (
            id VARCHAR(100) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            topic VARCHAR(100) NOT NULL,
            difficulty VARCHAR(20) NOT NULL,
            sort_order INTEGER NOT NULL,
            content TEXT NOT NULL,
            example_fen TEXT,
            example_pgn TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS title VARCHAR(200)');
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS topic VARCHAR(100)');
        await client.query("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20)");
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS sort_order INTEGER');
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content TEXT');
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS example_fen TEXT');
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS example_pgn TEXT');
        await client.query('ALTER TABLE lessons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

        // Lesson progress (per-user, one row per lesson)
        await client.query(`
          CREATE TABLE IF NOT EXISTS lesson_progress (
            user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            lesson_id VARCHAR(100) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            score INTEGER,
            completed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, lesson_id)
          )
        `);
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)');
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS lesson_id VARCHAR(100)');
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE');
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS score INTEGER');
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP');
        await client.query('ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

        // Seed the lessons catalog idempotently so progress rows can be tied to
        // known lesson ids even on existing installations.
        for (const lesson of LESSON_CATALOG) {
          await client.query(
            `INSERT INTO lessons (id, title, topic, difficulty, sort_order, content, example_fen, example_pgn)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               topic = EXCLUDED.topic,
               difficulty = EXCLUDED.difficulty,
               sort_order = EXCLUDED.sort_order,
               content = EXCLUDED.content,
               example_fen = EXCLUDED.example_fen,
               example_pgn = EXCLUDED.example_pgn`,
            [lesson.id, lesson.title, lesson.topic, lesson.difficulty, lesson.order, lesson.content, lesson.exampleFen ?? null, lesson.examplePgn ?? null]
          );
        }

        // Indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_games_code_unique ON games(game_code)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_games_code ON games(game_code)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_matchmaking_player_id ON matchmaking_queue(player_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_matchmaking_elo ON matchmaking_queue(elo)');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_active_games_game_id_unique ON active_games(game_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_active_games_game_id ON active_games(game_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_active_games_status ON active_games(status)');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_match_moves_game_username_unique ON match_moves(game_id, username)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_match_moves_game_id ON match_moves(game_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_match_moves_username ON match_moves(username)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_elo_history_user_id ON elo_history(user_id)');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_elo_history_user_game ON elo_history(user_id, game_code)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_lessons_order ON lessons(sort_order)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id)');

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