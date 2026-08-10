import express from 'express';
import { query } from '../db.js';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { authenticatedUserId } from '../coachAuth.js';
import { censorMessage } from '../socket/profanity.js';
import { isOnline } from '../socket/presence.js';

const router = express.Router();
const CHAT_LIMIT = 50;

async function resolveUserId(req, res) {
  const userId = await authenticatedUserId(req).catch(() => null);
  if (!userId) errorResponse(res, 401, 'Authentication required');
  return userId;
}

function normalizeRoom(room) {
  if (typeof room !== 'string') return '';
  const trimmed = room.trim().toLowerCase();
  if (!trimmed || trimmed.length > 50) return '';
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// --- Friends ---
router.get('/friends', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const result = await query(
      `SELECT f.user_id, f.friend_id, f.status, f.created_at, u.username
       FROM friends f
       JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE f.user_id = $1 OR f.friend_id = $1
       ORDER BY u.username ASC`,
      [userId]
    );

    const friends = result.rows.map((row) => ({
      id: row.user_id === userId ? row.friend_id : row.user_id,
      username: row.username,
      status: row.status,
      online: isOnline(row.user_id === userId ? row.friend_id : row.user_id),
      createdAt: row.created_at,
    }));

    res.json({ friends, count: friends.length });
  } catch (error) {
    handleRouteError(res, error, 'Failed to list friends');
  }
});

router.post('/friends/:username', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const username = req.params.username;
    if (!username || typeof username !== 'string') return errorResponse(res, 400, 'Username is required');

    const target = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    if (target.rowCount === 0) return errorResponse(res, 404, 'User not found');

    const friendId = target.rows[0].id;
    if (friendId === userId) return errorResponse(res, 400, 'You cannot add yourself as a friend');

    // Store the friendship as a single normalized pair (lower id, higher id) so
    // mutual adds cannot create two rows that would duplicate the friend in the
    // list query below.
    const ids = [String(userId), String(friendId)].sort();
    const [rowUserId, rowFriendId] = ids;

    try {
      await query(
        `INSERT INTO friends (user_id, friend_id, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'active'`,
        [rowUserId, rowFriendId]
      );
    } catch (error) {
      if (error?.code === '23505' || error?.constraint === 'friends_not_self') {
        return errorResponse(res, 409, 'Already friends');
      }
      throw error;
    }

    res.json({ success: true, friend: { id: friendId, username: username.trim() } });
  } catch (error) {
    handleRouteError(res, error, 'Failed to add friend');
  }
});

router.delete('/friends/:username', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const username = req.params.username;
    if (!username || typeof username !== 'string') return errorResponse(res, 400, 'Username is required');

    const target = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    if (target.rowCount === 0) return errorResponse(res, 404, 'User not found');
    const friendId = target.rows[0].id;

    await query(
      `DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to remove friend');
  }
});

// --- Chat ---
router.get('/chat/:room', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const room = normalizeRoom(req.params.room);
    if (!room) return errorResponse(res, 400, 'Invalid room');

    const limit = parseInt(req.query.limit, 10);
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : CHAT_LIMIT;

    const result = await query(
      `SELECT id, user_id, username, room, body, created_at
       FROM chat_messages
       WHERE room = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [room, safeLimit]
    );

    const messages = result.rows.reverse().map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username || 'guest',
      room: row.room,
      body: row.body,
      timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));

    res.json({ room, messages });
  } catch (error) {
    handleRouteError(res, error, 'Failed to load messages');
  }
});

router.post('/chat/:room', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const room = normalizeRoom(req.params.room);
    if (!room) return errorResponse(res, 400, 'Invalid room');

    const rawBody = req.body?.body;
    if (typeof rawBody !== 'string' || rawBody.trim().length === 0) return errorResponse(res, 400, 'Message cannot be empty');
    const body = rawBody.trim().slice(0, 500);

    const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
    const username = userResult.rows[0]?.username || 'guest';

    const result = await query(
      `INSERT INTO chat_messages (user_id, username, room, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, username, room, body, created_at`,
      [userId, username, room, censorMessage(body)]
    );

    const message = result.rows[0];
    res.json({
      message: {
        id: message.id,
        userId: message.user_id,
        username: message.username,
        room: message.room,
        body: message.body,
        timestamp: message.created_at instanceof Date ? message.created_at.toISOString() : message.created_at,
      },
    });
  } catch (error) {
    handleRouteError(res, error, 'Failed to send message');
  }
});

// --- Clubs ---
router.get('/clubs', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.slug, c.name, c.description, c.created_by, c.created_at,
              COUNT(cm.user_id) AS member_count
       FROM clubs c
       LEFT JOIN club_members cm ON cm.club_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );

    const clubs = result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberCount: parseInt(row.member_count, 10),
    }));

    res.json({ clubs, count: clubs.length });
  } catch (error) {
    handleRouteError(res, error, 'Failed to list clubs');
  }
});

router.post('/clubs', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const { name, description, slug } = req.body || {};
    if (typeof name !== 'string' || name.trim().length === 0) return errorResponse(res, 400, 'Club name is required');
    if (typeof description !== 'string') return errorResponse(res, 400, 'Description is required');

    const trimmedName = name.trim().slice(0, 80);
    let slugValue = '';

    if (typeof slug === 'string' && slug.trim()) {
      slugValue = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    }
    if (!slugValue) {
      slugValue = trimmedName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    }
    if (!slugValue) return errorResponse(res, 400, 'Could not generate a club slug');

    try {
      const result = await query(
        `INSERT INTO clubs (slug, name, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, name, description, created_by, created_at`,
        [slugValue, trimmedName, description.trim(), userId]
      );
      const club = result.rows[0];
      await query(
        `INSERT INTO club_members (club_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [club.id, userId]
      );
      res.status(201).json({ club });
    } catch (error) {
      if (error?.code === '23505') return errorResponse(res, 409, 'A club with that slug already exists');
      throw error;
    }
  } catch (error) {
    handleRouteError(res, error, 'Failed to create club');
  }
});

router.get('/clubs/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const result = await query(
      `SELECT c.id, c.slug, c.name, c.description, c.created_by, c.created_at,
              COUNT(cm.user_id) AS member_count
       FROM clubs c
       LEFT JOIN club_members cm ON cm.club_id = c.id
       WHERE c.slug = $1
       GROUP BY c.id`,
      [slug]
    );

    if (result.rowCount === 0) return errorResponse(res, 404, 'Club not found');

    const club = result.rows[0];
    const membersResult = await query(
      `SELECT cm.club_id, cm.user_id, cm.role, cm.created_at, u.username
       FROM club_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.club_id = $1
       ORDER BY u.username ASC`,
      [club.id]
    );

    res.json({
      club: {
        id: club.id,
        slug: club.slug,
        name: club.name,
        description: club.description,
        createdBy: club.created_by,
        createdAt: club.created_at,
        memberCount: parseInt(club.member_count, 10),
      },
      members: membersResult.rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        role: row.role,
      })),
    });
  } catch (error) {
    handleRouteError(res, error, 'Failed to load club');
  }
});

router.post('/clubs/:slug/join', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const clubResult = await query('SELECT id, slug FROM clubs WHERE slug = $1', [req.params.slug]);
    if (clubResult.rowCount === 0) return errorResponse(res, 404, 'Club not found');

    try {
      await query(
        `INSERT INTO club_members (club_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (club_id, user_id) DO NOTHING`,
        [clubResult.rows[0].id, userId]
      );
    } catch (error) {
      if (error?.code === '23505') {
        return res.json({ success: true, message: 'Already a member' });
      }
      throw error;
    }

    res.json({ success: true, club: clubResult.rows[0] });
  } catch (error) {
    handleRouteError(res, error, 'Failed to join club');
  }
});

router.post('/clubs/:slug/leave', async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const clubResult = await query('SELECT id FROM clubs WHERE slug = $1', [req.params.slug]);
    if (clubResult.rowCount === 0) return errorResponse(res, 404, 'Club not found');

    await query('DELETE FROM club_members WHERE club_id = $1 AND user_id = $2', [clubResult.rows[0].id, userId]);

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to leave club');
  }
});

export default router;
