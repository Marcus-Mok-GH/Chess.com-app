import { query } from './query.js';

/**
 * Ensures the necessary tables for Better Auth exist in the database.
 * This is a lightweight migration that runs on startup.
 */
export async function ensureAuthTables() {
  console.log('[Auth] Checking database tables...');

  // Table schema based on Better Auth requirements
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      image TEXT,
      elo INTEGER DEFAULT 1200,
      games_played INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at TIMESTAMP,
      refresh_token_expires_at TIMESTAMP,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    // NOTE: verifications table intentionally omitted.
    // OTP delivery and validation is handled entirely by Neon Auth (Stack Auth).
    // No server-side OTP storage is required.
  ];

  let migrationFailed = false;
  const failedTables = [];

  for (const tableSql of tables) {
    try {
      await query(tableSql);
    } catch (error) {
      migrationFailed = true;
      const tableName = tableSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || 'unknown';
      failedTables.push(tableName);
      console.error(`[Auth] Failed to ensure table ${tableName}:`, error.message);
    }
  }

  if (migrationFailed) {
    const errorMsg = `[Auth] FATAL: Database migration failed for tables: ${failedTables.join(', ')}`;
    console.error(errorMsg);
    process.exit(1);
  }

  console.log('[Auth] Database tables verified.');
}
