import express from 'express';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { getSessionToken, validateSession } from '../auth.js';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from '../services/notificationService.js';

const router = express.Router();

// Every route below is scoped to the caller's own inbox: identity always comes
// from the session, never from the request body.
async function currentUserId(req) {
  return validateSession(getSessionToken(req));
}

// GET /api/notifications — recent inbox entries plus the unread badge count.
router.get('/', async (req, res) => {
  try {
    const userId = await currentUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(userId, { limit: req.query.limit }),
      countUnreadNotifications(userId),
    ]);
    return res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to load notifications');
  }
});

// POST /api/notifications/read — `{ all: true }` clears the inbox, otherwise
// only the listed ids are marked read.
router.post('/read', async (req, res) => {
  try {
    const userId = await currentUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const all = req.body?.all === true;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!all && !ids.length) return errorResponse(res, 400, 'Provide all or a list of notification ids');
    const unreadCount = await markNotificationsRead(userId, { all, ids });
    return res.json({ success: true, unreadCount });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update notifications');
  }
});

export default router;
