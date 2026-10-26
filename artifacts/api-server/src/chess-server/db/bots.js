/**
 * Bot account management.
 * Bots are stored in the users table with is_bot=true and linked config in bot_configs.
 */

import { query } from './query.js';

export async function createBotAccount({ username, email, passwordHash, displayName, isAdmin = false }) {
  const result = await query(
    `INSERT INTO users (username, email, password_hash, elo, is_bot, bot_config_id, created_at)
     VALUES ($1, $2, $3, 1200, true, null, CURRENT_TIMESTAMP)
     RETURNING id, username, email, elo, is_bot, created_at`,
    [username, email, passwordHash]
  );
  return result.rows[0];
}

export async function getBotById(botId) {
  const result = await query(
    `SELECT u.*, bc.config as bot_config
     FROM users u
     LEFT JOIN bot_configs bc ON bc.bot_user_id = u.id
     WHERE u.id = $1 AND u.is_bot = true`,
    [botId]
  );
  return result.rows[0] || null;
}

export async function getBotByUsername(username) {
  const result = await query(
    `SELECT u.*, bc.config as bot_config
     FROM users u
     LEFT JOIN bot_configs bc ON bc.bot_user_id = u.id
     WHERE u.username = $1 AND u.is_bot = true`,
    [username]
  );
  return result.rows[0] || null;
}

export async function listBots({ limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT u.id, u.username, u.email, u.elo, u.games_played, u.wins, u.losses, u.draws,
            u.is_bot, u.created_at, bc.config as bot_config
     FROM users u
     LEFT JOIN bot_configs bc ON bc.bot_user_id = u.id
     WHERE u.is_bot = true
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

export async function updateBotConfig(botUserId, config) {
  const result = await query(
    `INSERT INTO bot_configs (bot_user_id, config, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (bot_user_id) DO UPDATE SET config = EXCLUDED.config, updated_at = CURRENT_TIMESTAMP
     RETURNING bot_user_id, config, updated_at`,
    [botUserId, JSON.stringify(config)]
  );
  return result.rows[0];
}

export async function deleteBot(botUserId) {
  // Delete bot config first (FK), then the bot user
  await query('DELETE FROM bot_configs WHERE bot_user_id = $1', [botUserId]);
  const result = await query('DELETE FROM users WHERE id = $1 AND is_bot = true RETURNING id', [botUserId]);
  return result.rowCount > 0;
}

export async function ensureBotTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS bot_configs (
      bot_user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getBotSession(botUserId) {
  // Create or get a session token for the bot
  const result = await query(
    `SELECT token FROM sessions WHERE user_id = $1 AND expires_at > NOW() LIMIT 1`,
    [botUserId]
  );
  if (result.rows[0]) return result.rows[0].token;

  // Create new session
  const crypto = await import('node:crypto');
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (user_id, token, expires_at, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '365 days', CURRENT_TIMESTAMP)`,
    [botUserId, token]
  );
  return token;
}
