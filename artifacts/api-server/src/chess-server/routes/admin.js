/**
 * /api/admin/* router — account management for admins.
 *
 * Admins are the user ids listed in CHESS_REVIEW_ADMIN_IDS (the same gate as
 * the integrity review endpoints). Endpoints:
 *
 *   GET    /api/admin/users?q=<search>   search accounts by username or email
 *   POST   /api/admin/users/:id/ban      ban an account (kicks active sessions)
 *   POST   /api/admin/users/:id/unban    restore a banned account
 *   DELETE /api/admin/users/:id          permanently delete an account
 *
 * Guards: an admin can never ban or delete their own account or
 * another admin account.
 */

import express from 'express';

import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { getSessionToken, validateSession } from '../auth.js';
import { isIntegrityReviewer } from '../services/antiCheatService.js';

const router = express.Router();

const SEARCH_LIMIT = 25;
const MAX_BAN_REASON_LENGTH = 300;
const USER_ID_RE = /^[A-Za-z0-9-]{6,100}$/;

const ADMIN_COLUMNS = `id, username, email, elo, games_played, wins, losses, draws,
       is_banned, banned_at, banned_reason, created_at`;

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
