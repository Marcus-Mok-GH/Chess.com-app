/**
 * /api/admin/bots/* router — bot management for admins.
 *
 * Endpoints:
 *   GET    /api/admin/bots                  list all bots
 *   POST   /api/admin/bots                  create a new bot
 *   GET    /api/admin/bots/:id              get bot details
 *   PATCH  /api/admin/bots/:id              update a bot
 *   POST   /api/admin/bots/:id/activate     activate a bot
 *   POST   /api/admin/bots/:id/deactivate   deactivate a bot
 *   DELETE /api/admin/bots/:id              delete a bot
 *   GET    /api/admin/bots/:id/activity     get bot activity log
 *
 * Bots are special user accounts that behave like human players:
 * - They join matchmaking queues
 * - They make moves using their configured AI model
 * - They chat in-game with configurable frequency
 * - They can create/join communities
 */

import express from 'express';
import bcrypt from 'bcryptjs';

import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { getSessionToken, validateSession } from '../auth.js';
import { isIntegrityReviewer } from '../services/antiCheatService.js';

const router = express.Router();

const BOT_ID_RE = /^[A-Za-z0-9-]{6,100}$/;
const VALID_PLAY_STYLES = ['aggressive', 'balanced', 'positional', 'tactical', 'defensive', 'random'];
const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus', 'gemini-1.5-flash', 'gemini-1.5-pro'];

const BOT_COLUMNS = `b.id, b.name, b.avatar, b.personality, b.system_prompt, b.model, b.elo,
       b.is_active, b.play_style, b.chat_frequency, b.community_creator,
       b.created_by, b.created_at, b.updated_at,
       u.username as bot_username, u.email as bot_email, u.is_banned as bot_is_banned`;

// Every bot route requires a valid admin session.
router.use(async (req, res, next) => {
  try {
    const userId = await validateSession(getSessionToken(req));
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    if (!isIntegrityReviewer(userId)) return errorResponse(res, 403, 'Admin access required');
    req.adminId = String(userId);
    return next();
  } catch (error) {
    return handleRouteError(res, error, 'Admin authorization failed');
  }
});

function validateBotId(id) {
  return BOT_ID_RE.test(String(id || '').trim());
}

function shapeBot(row) {
  return {
    id: row.id,
    username: row.bot_username,
    email: row.bot_email,
    name: row.name,
    avatar: row.avatar,
    personality: row.personality,
    systemPrompt: row.system_prompt,
    model: row.model,
    elo: row.elo,
    isActive: Boolean(row.is_active),
    playStyle: row.play_style,
    chatFrequency: parseFloat(row.chat_frequency || 0.30),
    communityCreator: Boolean(row.community_creator),
    isBanned: Boolean(row.bot_is_banned),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/bots
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT ${BOT_COLUMNS}
         FROM bots b
         JOIN users u ON u.id = b.id
        ORDER BY b.created_at DESC`
    );
    return res.json({ success: true, bots: result.rows.map(shapeBot) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to list bots');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bots
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      name,
      avatar,
      personality,
      systemPrompt,
      model,
      elo,
      playStyle,
      chatFrequency,
      communityCreator,
    } = req.body || {};

    // Validate required fields
    if (!username || !email || !password || !name || !personality || !systemPrompt) {
      return errorResponse(res, 400, 'Missing required fields: username, email, password, name, personality, systemPrompt');
    }

    const trimmedUsername = String(username).trim().slice(0, 50);
    const trimmedEmail = String(email).trim().slice(0, 100);
    const trimmedName = String(name).trim().slice(0, 50);
    const trimmedAvatar = String(avatar || '🤖').trim().slice(0, 10);
    const trimmedPersonality = String(personality).trim().slice(0, 2000);
    const trimmedSystemPrompt = String(systemPrompt).trim().slice(0, 5000);
    const selectedModel = VALID_MODELS.includes(model) ? model : 'gpt-4o-mini';
    const selectedElo = Number.isInteger(elo) && elo >= 100 && elo <= 4000 ? elo : 1200;
    const selectedPlayStyle = VALID_PLAY_STYLES.includes(playStyle) ? playStyle : 'balanced';
    const selectedChatFrequency = typeof chatFrequency === 'number' && chatFrequency >= 0 && chatFrequency <= 1
      ? Math.round(chatFrequency * 100) / 100
      : 0.30;
    const selectedCommunityCreator = Boolean(communityCreator);

    // Check if username/email already exists
    const existing = await query(
      `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
      [trimmedUsername, trimmedEmail]
    );
    if (existing.rowCount > 0) {
      return errorResponse(res, 409, 'Username or email already exists');
    }

    // Create the bot user account
    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await query(
      `INSERT INTO users (username, email, password_hash, elo, is_banned)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, username, email, elo, is_banned, created_at`,
      [trimmedUsername, trimmedEmail, passwordHash, selectedElo]
    );
    const botUser = userResult.rows[0];

    // Create the bot profile
    const botResult = await query(
      `INSERT INTO bots (id, name, avatar, personality, system_prompt, model, elo,
                         is_active, play_style, chat_frequency, community_creator, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, $11)
       RETURNING *`,
      [
        botUser.id,
        trimmedName,
        trimmedAvatar,
        trimmedPersonality,
        trimmedSystemPrompt,
        selectedModel,
        selectedElo,
        selectedPlayStyle,
        selectedChatFrequency,
        selectedCommunityCreator,
        req.adminId,
      ]
    );

    // Log activity
    await query(
      `INSERT INTO bot_activity (bot_id, action, details)
       VALUES ($1, 'created', $2)`,
      [botUser.id, JSON.stringify({ name: trimmedName, model: selectedModel, elo: selectedElo })]
    );

    const bot = botResult.rows[0];
    return res.status(201).json({
      success: true,
      bot: shapeBot({ ...bot, ...botUser }),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to create bot');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/bots/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const result = await query(
      `SELECT ${BOT_COLUMNS}
         FROM bots b
         JOIN users u ON u.id = b.id
        WHERE b.id = $1`,
      [id]
    );

    if (result.rowCount === 0) return errorResponse(res, 404, 'Bot not found');

    return res.json({ success: true, bot: shapeBot(result.rows[0]) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to load bot');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/bots/:id
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const {
      name,
      avatar,
      personality,
      systemPrompt,
      model,
      elo,
      playStyle,
      chatFrequency,
      communityCreator,
    } = req.body || {};

    // Build dynamic update
    const updates = [];
    const values = [id];
    let paramIndex = 2;

    if (name != null) {
      updates.push(`name = $${paramIndex++}`);
      values.push(String(name).trim().slice(0, 50));
    }
    if (avatar != null) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(String(avatar).trim().slice(0, 10));
    }
    if (personality != null) {
      updates.push(`personality = $${paramIndex++}`);
      values.push(String(personality).trim().slice(0, 2000));
    }
    if (systemPrompt != null) {
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(String(systemPrompt).trim().slice(0, 5000));
    }
    if (model != null) {
      if (!VALID_MODELS.includes(model)) {
        return errorResponse(res, 400, `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}`);
      }
      updates.push(`model = $${paramIndex++}`);
      values.push(model);
    }
    if (elo != null) {
      const eloNum = Number(elo);
      if (!Number.isInteger(eloNum) || eloNum < 100 || eloNum > 4000) {
        return errorResponse(res, 400, 'Elo must be a whole number between 100 and 4000');
      }
      updates.push(`elo = $${paramIndex++}`);
      values.push(eloNum);
      // Also update users table
      await query('UPDATE users SET elo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [eloNum, id]);
    }
    if (playStyle != null) {
      if (!VALID_PLAY_STYLES.includes(playStyle)) {
        return errorResponse(res, 400, `Invalid play style. Must be one of: ${VALID_PLAY_STYLES.join(', ')}`);
      }
      updates.push(`play_style = $${paramIndex++}`);
      values.push(playStyle);
    }
    if (chatFrequency != null) {
      const freq = Number(chatFrequency);
      if (typeof freq !== 'number' || freq < 0 || freq > 1) {
        return errorResponse(res, 400, 'Chat frequency must be a number between 0 and 1');
      }
      updates.push(`chat_frequency = $${paramIndex++}`);
      values.push(Math.round(freq * 100) / 100);
    }
    if (communityCreator != null) {
      updates.push(`community_creator = $${paramIndex++}`);
      values.push(Boolean(communityCreator));
    }

    if (updates.length === 0) {
      return errorResponse(res, 400, 'No valid fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await query(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );

    if (result.rowCount === 0) return errorResponse(res, 404, 'Bot not found');

    // Log activity
    await query(
      `INSERT INTO bot_activity (bot_id, action, details)
       VALUES ($1, 'updated', $2)`,
      [id, JSON.stringify(req.body)]
    );

    // Fetch full bot with user info
    const fullResult = await query(
      `SELECT ${BOT_COLUMNS}
         FROM bots b
         JOIN users u ON u.id = b.id
        WHERE b.id = $1`,
      [id]
    );

    return res.json({ success: true, bot: shapeBot(fullResult.rows[0]) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update bot');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bots/:id/activate
// ---------------------------------------------------------------------------
router.post('/:id/activate', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const result = await query(
      `UPDATE bots SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) return errorResponse(res, 404, 'Bot not found');

    await query(
      `INSERT INTO bot_activity (bot_id, action, details)
       VALUES ($1, 'activated', $2)`,
      [id, JSON.stringify({})]
    );

    const fullResult = await query(
      `SELECT ${BOT_COLUMNS}
         FROM bots b
         JOIN users u ON u.id = b.id
        WHERE b.id = $1`,
      [id]
    );

    return res.json({ success: true, bot: shapeBot(fullResult.rows[0]) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to activate bot');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/bots/:id/deactivate
// ---------------------------------------------------------------------------
router.post('/:id/deactivate', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const result = await query(
      `UPDATE bots SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) return errorResponse(res, 404, 'Bot not found');

    await query(
      `INSERT INTO bot_activity (bot_id, action, details)
       VALUES ($1, 'deactivated', $2)`,
      [id, JSON.stringify({})]
    );

    const fullResult = await query(
      `SELECT ${BOT_COLUMNS}
         FROM bots b
         JOIN users u ON u.id = b.id
        WHERE b.id = $1`,
      [id]
    );

    return res.json({ success: true, bot: shapeBot(fullResult.rows[0]) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to deactivate bot');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/bots/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const bot = await query('SELECT * FROM bots WHERE id = $1', [id]);
    if (bot.rowCount === 0) return errorResponse(res, 404, 'Bot not found');

    // Delete bot profile (cascades to users via FK)
    await query('DELETE FROM bots WHERE id = $1', [id]);

    // Log activity (before user deletion)
    await query(
      `INSERT INTO bot_activity (bot_id, action, details)
       VALUES ($1, 'deleted', $2)`,
      [id, JSON.stringify({ name: bot.rows[0].name })]
    );

    // Delete user account (cascades to bots)
    await query('DELETE FROM users WHERE id = $1', [id]);

    return res.json({ success: true, deleted: { id } });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to delete bot');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/bots/:id/activity
// ---------------------------------------------------------------------------
router.get('/:id/activity', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateBotId(id)) return errorResponse(res, 400, 'Invalid bot id');

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await query(
      `SELECT id, bot_id, action, details, created_at
         FROM bot_activity
        WHERE bot_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return res.json({
      success: true,
      activity: result.rows.map(row => ({
        id: row.id,
        botId: row.bot_id,
        action: row.action,
        details: row.details,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to load bot activity');
  }
});

export default router;