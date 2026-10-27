/**
 * /api/admin/* router — account management for admins.
 *
 * Admins are the user ids listed in CHESS_REVIEW_ADMIN_IDS (the same gate as
 * the integrity review endpoints). Endpoints:
 *
 *   GET    /api/admin/users?q=<search>       search accounts by username or email
 *   GET    /api/admin/users/:id/analytics     per-user analytics: elo, W/L/D, game history
 *   PATCH  /api/admin/users/:id/elo           set a user's elo rating
 *   POST   /api/admin/users/:id/ban           ban an account (kicks active sessions)
 *   POST   /api/admin/users/:id/unban         restore a banned account
 *   DELETE /api/admin/users/:id               permanently delete an account
 *
 * Guards: an admin can never ban or delete their own account or
 * another admin account.
 */

import express from 'express';

import { query, withTransaction } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { getSessionToken, validateSession } from '../auth.js';
import { isIntegrityReviewer } from '../services/antiCheatService.js';
import { getPollinationsTextModels } from '../services/pollinationsModels.js';
import { getCoachToken } from '../coachAuth.js';

const router = express.Router();

const SEARCH_LIMIT = 25;
const MAX_BAN_REASON_LENGTH = 300;
const USER_ID_RE = /^[A-Za-z0-9-]{6,100}$/;

const ADMIN_COLUMNS = `id, username, email, elo, games_played, wins, losses, draws,
       is_banned, banned_at, banned_reason, created_at`;
const CHAT_FREQUENCY_VALUES = { low: 0.15, medium: 0.3, high: 0.6 };

function normalizeChatFrequency(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) return value;
  return CHAT_FREQUENCY_VALUES[value] ?? null;
}

function shapeAdminUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    elo: row.elo ?? 1200,
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    isBanned: Boolean(row.is_banned),
    bannedAt: row.banned_at || null,
    bannedReason: row.banned_reason || null,
    isAdmin: isIntegrityReviewer(row.id),
    createdAt: row.created_at,
  };
}

// Every admin route requires a valid session owned by an admin.
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

function validateUserId(id) {
  return USER_ID_RE.test(String(id || '').trim());
}

async function loadUser(id) {
  const result = await query(
    `SELECT ${ADMIN_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/users?q=<search>
// ---------------------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    let result;
    if (q === '') {
      // Empty search: list every account (banned first, then alphabetical),
      // so the admin panel shows the full roster when the box is untouched.
      result = await query(
        `SELECT ${ADMIN_COLUMNS}
           FROM users
          ORDER BY is_banned DESC, username ASC
          LIMIT ${SEARCH_LIMIT}`,
        []
      );
    } else {
      if (q.length < 2) return errorResponse(res, 400, 'Enter at least 2 characters to search.');
      // Default ILIKE escape character is the backslash.
      const pattern = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      result = await query(
        `SELECT ${ADMIN_COLUMNS}
           FROM users
          WHERE username ILIKE $1 OR email ILIKE $1
          ORDER BY is_banned DESC, username ASC
          LIMIT ${SEARCH_LIMIT}`,
        [pattern]
      );
    }
    return res.json({ success: true, users: result.rows.map(shapeAdminUser) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to search users');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id/analytics
// ---------------------------------------------------------------------------
const RECENT_GAMES_LIMIT = 50;

router.get('/users/:id/analytics', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateUserId(id)) return errorResponse(res, 400, 'Invalid user id');

    const user = await loadUser(id);
    if (!user) return errorResponse(res, 404, 'User not found');

    const totals = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (
           WHERE (white_player_id = $1 AND result = 'white')
              OR (black_player_id = $1 AND result = 'black')
         ) AS wins,
         COUNT(*) FILTER (
           WHERE (white_player_id = $1 AND result = 'black')
              OR (black_player_id = $1 AND result = 'white')
         ) AS losses,
         COUNT(*) FILTER (
           WHERE result = 'draw' AND (white_player_id = $1 OR black_player_id = $1)
         ) AS draws
       FROM games
      WHERE white_player_id = $1 OR black_player_id = $1`,
      [id]
    );
    const recent = await query(
      `SELECT game_code, white_player_id, black_player_id, white_player_name,
              black_player_name, result, game_mode, status, created_at
         FROM games
        WHERE white_player_id = $1 OR black_player_id = $1
        ORDER BY created_at DESC
        LIMIT ${RECENT_GAMES_LIMIT}`,
      [id]
    );

    const row = totals.rows[0] || {};
    const total = Number(row.total || 0);
    const wins = Number(row.wins || 0);
    const losses = Number(row.losses || 0);
    const draws = Number(row.draws || 0);

    const recentGames = recent.rows.map((g) => {
      const isWhite = String(g.white_player_id) === id;
      const won = g.result === (isWhite ? 'white' : 'black');
      const drawn = g.result === 'draw' || g.result === 'drawn';
      return {
        gameId: g.game_code,
        color: isWhite ? 'white' : 'black',
        opponent: isWhite ? g.black_player_name : g.white_player_name,
        result: won ? 'win' : drawn ? 'draw' : 'loss',
        rawResult: g.result,
        mode: g.game_mode,
        status: g.status,
        playedAt: g.created_at,
      };
    });

    return res.json({
      success: true,
      user: shapeAdminUser(user),
      stats: {
        totalGames: total,
        wins,
        losses,
        draws,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      },
      recentGames,
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to load user analytics');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id/elo  { elo: number }
// ---------------------------------------------------------------------------
const MIN_ELO = 100;
const MAX_ELO = 4000;

router.patch('/users/:id/elo', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateUserId(id)) return errorResponse(res, 400, 'Invalid user id');

    const user = await loadUser(id);
    if (!user) return errorResponse(res, 404, 'User not found');

    const elo = Number(req.body?.elo);
    if (!Number.isInteger(elo) || elo < MIN_ELO || elo > MAX_ELO) {
      return errorResponse(res, 400, `Elo must be a whole number between ${MIN_ELO} and ${MAX_ELO}.`);
    }

    const updated = await query(
      `UPDATE users
          SET elo = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${ADMIN_COLUMNS}`,
      [id, elo]
    );
    const shaped = shapeAdminUser(updated.rows[0] || { ...user, elo });
    return res.json({ success: true, user: shaped, previousElo: user.elo ?? 1200 });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update elo');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/ban  { reason?: string }
// ---------------------------------------------------------------------------
router.post('/users/:id/ban', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateUserId(id)) return errorResponse(res, 400, 'Invalid user id');

    const user = await loadUser(id);
    if (!user) return errorResponse(res, 404, 'User not found');
    if (id === req.adminId) return errorResponse(res, 403, 'You cannot ban your own account.');
    if (user.is_banned) return res.json({ success: true, user: shapeAdminUser(user) });
    if (isIntegrityReviewer(id)) return errorResponse(res, 403, 'Admin accounts cannot be banned.');

    const reason = req.body?.reason == null
      ? null
      : String(req.body.reason).trim().slice(0, MAX_BAN_REASON_LENGTH) || null;

    const updated = await query(
      `UPDATE users
          SET is_banned = TRUE, banned_at = CURRENT_TIMESTAMP, banned_reason = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${ADMIN_COLUMNS}`,
      [id, reason]
    );
    // Kick every active session immediately.
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);

    const banned = updated.rows[0] || user;
    return res.json({ success: true, user: shapeAdminUser(banned) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to ban user');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/unban
// ---------------------------------------------------------------------------
router.post('/users/:id/unban', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateUserId(id)) return errorResponse(res, 400, 'Invalid user id');

    const user = await loadUser(id);
    if (!user) return errorResponse(res, 404, 'User not found');

    const updated = await query(
      `UPDATE users
          SET is_banned = FALSE, banned_at = NULL, banned_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING ${ADMIN_COLUMNS}`,
      [id]
    );

    const unbanned = updated.rows[0] || user;
    return res.json({ success: true, user: shapeAdminUser(unbanned) });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to unban user');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id
// ---------------------------------------------------------------------------
router.delete('/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!validateUserId(id)) return errorResponse(res, 400, 'Invalid user id');

    const user = await loadUser(id);
    if (!user) return errorResponse(res, 404, 'User not found');
    if (id === req.adminId) return errorResponse(res, 403, 'You cannot delete your own account.');
    if (isIntegrityReviewer(id)) return errorResponse(res, 403, 'Admin accounts cannot be deleted.');

    // games.*_player_id has no ON DELETE action, so detach the user's games
    // first; everything else either cascades or is nullable already.
    await query('UPDATE games SET white_player_id = NULL WHERE white_player_id = $1', [id]);
    await query('UPDATE games SET black_player_id = NULL WHERE black_player_id = $1', [id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);
    const deleted = await query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);

    return res.json({
      success: true,
      deleted: deleted.rows[0] || { id, username: user.username },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to delete user');
  }
});

export default router;

// ---------------------------------------------------------------------------
// BOTS ADMIN ROUTES
// ---------------------------------------------------------------------------

// GET /api/admin/bots/models
router.get('/bots/models', async (req, res) => {
  try {
    const models = await getPollinationsTextModels();
    let connected = false;
    try {
      connected = Boolean(await getCoachToken(req.adminId));
    } catch (error) {
      console.warn('[BotBuilder] Could not check Pollinations connection:', error?.message || error);
    }
    return res.json({ success: true, models, connected });
  } catch (error) {
    console.error('[BotBuilder] Failed to load model catalog:', error?.message || error);
    return errorResponse(res, 502, 'Could not load available AI models. Please try again.');
  }
});

// GET /api/admin/bots
router.get('/bots', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id, username, display_name, avatar, personality, system_prompt, model,
         elo, play_style, chat_frequency, chat_style,
         join_communities, create_communities, auto_join_matches,
         is_active, is_public, created_by, created_at,
         games_played, wins, losses, draws, win_rate,
         messages_sent, communities_joined
       FROM bots
       ORDER BY created_at DESC`
    );
    return res.json({ success: true, bots: result.rows });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to list bots');
  }
});

// POST /api/admin/bots
router.post('/bots', async (req, res) => {
  try {
    const {
      username,
      display_name,
      avatar = '♟️',
      personality,
      system_prompt = '',
      model,
      elo = 1500,
      play_style = 'balanced',
      chat_frequency = 'medium',
      chat_style = 'friendly',
      join_communities = false,
      create_communities = false,
      auto_join_matches = false,
      is_active = true,
      is_public = true,
    } = req.body || {};

    // Validation
    if (!username || !display_name || !personality) {
      return errorResponse(res, 400, 'username, display_name, and personality are required');
    }
    if (typeof model !== 'string' || !model.trim()) {
      return errorResponse(res, 400, 'Choose an available AI model');
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return errorResponse(res, 400, 'Username must be 3-20 characters (letters, numbers, underscore)');
    }
    if (elo < 100 || elo > 3000) {
      return errorResponse(res, 400, 'ELO must be between 100 and 3000');
    }

    const normalizedChatFrequency = normalizeChatFrequency(chat_frequency);
    if (normalizedChatFrequency === null) {
      return errorResponse(res, 400, 'Chat frequency must be low, medium, or high');
    }

    // Usernames are global account identifiers, not just bot labels.
    const existing = await query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [username]);
    if (existing.rows.length > 0) {
      return errorResponse(res, 409, 'Username already taken');
    }

    const botId = crypto.randomUUID();
    const bot = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, username, avatar, elo, is_bot, created_at)
         VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)`,
        [botId, username, avatar, elo]
      );
      const result = await client.query(
        `INSERT INTO bots (
           id, name, username, display_name, avatar, personality, system_prompt, model,
           elo, play_style, chat_frequency, chat_style,
           join_communities, create_communities, auto_join_matches,
           is_active, is_public, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18
         )
         RETURNING
           id, username, display_name, avatar, personality, system_prompt, model,
           elo, play_style, chat_frequency, chat_style,
           join_communities, create_communities, auto_join_matches,
           is_active, is_public, created_by, created_at,
           games_played, wins, losses, draws, win_rate,
           messages_sent, communities_joined`,
        [botId, display_name, username, display_name, avatar, personality, system_prompt, model.trim(),
         elo, play_style, normalizedChatFrequency, chat_style,
         join_communities, create_communities, auto_join_matches,
         is_active, is_public, req.adminId]
      );
      return result.rows[0];
    });
    return res.status(201).json({ success: true, bot });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to create bot');
  }
});

// PATCH /api/admin/bots/:id
router.patch('/bots/:id', async (req, res) => {
  try {
    const botId = String(req.params.id || '').trim();
    if (!botId) return errorResponse(res, 400, 'Invalid bot id');

    const existing = await query('SELECT * FROM bots WHERE id = $1', [botId]);
    if (existing.rows.length === 0) return errorResponse(res, 404, 'Bot not found');

    const {
      display_name,
      avatar,
      personality,
      system_prompt,
      model,
      elo,
      play_style,
      chat_frequency,
      chat_style,
      join_communities,
      create_communities,
      auto_join_matches,
      is_active,
      is_public,
    } = req.body || {};

    // Build dynamic update
    const updates = [];
    const params = [botId];
    let paramIndex = 2;

    const addField = (field, value) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    };

    if (display_name !== undefined) {
      addField('display_name', display_name);
      addField('name', display_name);
    }
    if (avatar !== undefined) addField('avatar', avatar);
    if (personality !== undefined) addField('personality', personality);
    if (system_prompt !== undefined) addField('system_prompt', system_prompt);
    if (model !== undefined) {
      if (typeof model !== 'string' || !model.trim()) {
        return errorResponse(res, 400, 'Choose an available AI model');
      }
      addField('model', model.trim());
    }
    if (elo !== undefined) {
      if (!Number.isInteger(elo) || elo < 100 || elo > 3000) {
        return errorResponse(res, 400, 'ELO must be a whole number between 100 and 3000');
      }
      addField('elo', elo);
    }
    if (play_style !== undefined) addField('play_style', play_style);
    if (chat_frequency !== undefined) {
      const normalized = normalizeChatFrequency(chat_frequency);
      if (normalized === null) {
        return errorResponse(res, 400, 'Chat frequency must be low, medium, or high');
      }
      addField('chat_frequency', normalized);
    }
    if (chat_style !== undefined) addField('chat_style', chat_style);
    if (join_communities !== undefined) addField('join_communities', join_communities);
    if (create_communities !== undefined) addField('create_communities', create_communities);
    if (auto_join_matches !== undefined) addField('auto_join_matches', auto_join_matches);
    if (is_active !== undefined) addField('is_active', is_active);
    if (is_public !== undefined) addField('is_public', is_public);

    if (updates.length === 0) {
      return errorResponse(res, 400, 'No fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await query(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = $1
       RETURNING
         id, username, display_name, avatar, personality, system_prompt, model,
         elo, play_style, chat_frequency, chat_style,
         join_communities, create_communities, auto_join_matches,
         is_active, is_public, created_by, created_at,
         games_played, wins, losses, draws, win_rate,
         messages_sent, communities_joined`,
      params
    );
    return res.json({ success: true, bot: result.rows[0] });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update bot');
  }
});

// DELETE /api/admin/bots/:id
router.delete('/bots/:id', async (req, res) => {
  try {
    const botId = String(req.params.id || '').trim();
    if (!botId) return errorResponse(res, 400, 'Invalid bot id');

    const result = await query('DELETE FROM bots WHERE id = $1 RETURNING id, username', [botId]);
    if (result.rows.length === 0) return errorResponse(res, 404, 'Bot not found');

    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to delete bot');
  }
});


// GET /api/admin/bots/:id/activity
router.get('/bots/:id/activity', async (req, res) => {
  try {
    const botId = String(req.params.id || '').trim();
    if (!botId) return errorResponse(res, 400, 'Invalid bot id');

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await query(
      `SELECT COALESCE(activity_type, action) AS action,
              COALESCE(metadata, details) AS details,
              created_at
       FROM bot_activity
       WHERE bot_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [botId, limit]);
    return res.json({ success: true, activity: result.rows });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to fetch bot activity');
  }
});

// POST /api/admin/bots/:id/start
router.post('/bots/:id/start', async (req, res) => {
  try {
    const botId = String(req.params.id || '').trim();
    if (!botId) return errorResponse(res, 400, 'Invalid bot id');

    const existing = await query('SELECT * FROM bots WHERE id = $1', [botId]);
    if (existing.rows.length === 0) return errorResponse(res, 404, 'Bot not found');

    await query(
      `UPDATE bots SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [botId]);
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to start bot');
  }
});

// POST /api/admin/bots/:id/stop
router.post('/bots/:id/stop', async (req, res) => {
  try {
    const botId = String(req.params.id || '').trim();
    if (!botId) return errorResponse(res, 400, 'Invalid bot id');

    const existing = await query('SELECT * FROM bots WHERE id = $1', [botId]);
    if (existing.rows.length === 0) return errorResponse(res, 404, 'Bot not found');

    await query(
      `UPDATE bots SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [botId]);
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to stop bot');
  }
});
