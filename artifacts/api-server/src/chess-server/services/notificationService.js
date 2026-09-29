/**
 * Per-user notification inbox.
 *
 * Notifications are server-authored: nothing in the API lets one account write
 * to another's inbox. Today the only producer is the fair-play flow (see
 * antiCheatService), which notifies a confirmed case's opponent and reviewers.
 */
import { query } from '../db.js';

export const CHEAT_CONFIRMED_NOTIFICATION = 'cheat_confirmed';

const MAX_LIST_LIMIT = 100;

function toRecipientId(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** Writes the given normalized rows in a single statement. */
async function insertNotifications(rows) {
  const values = [];
  const params = [];
  rows.forEach((row) => {
    const base = params.length;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    params.push(row.recipientId, row.type, row.gameCode, row.title, row.body, JSON.stringify(row.payload));
  });

  const result = await query(
    `INSERT INTO notifications (recipient_id, type, game_code, title, body, payload)
     VALUES ${values.join(', ')}
     ON CONFLICT (recipient_id, type, game_code)
     DO UPDATE SET title = EXCLUDED.title,
                   body = EXCLUDED.body,
                   payload = EXCLUDED.payload,
                   read_at = NULL,
                   created_at = CURRENT_TIMESTAMP
     RETURNING id, recipient_id, type, game_code, title, body, payload, read_at, created_at`,
    params
  );
  return result.rows;
}

/**
 * Inserts a batch of notifications, keyed on (recipient, type, game) so a
 * repeated trigger refreshes the original entry instead of stacking a
 * duplicate in the same inbox.
 *
 * Delivery is per-recipient rather than all-or-nothing. `recipient_id` is a
 * foreign key onto users, so a single unroutable recipient — a stale id in
 * CHESS_REVIEW_ADMIN_IDS, say — would otherwise fail the whole statement and
 * take everyone else's notification down with it. The batch is still tried
 * first for the common case; only on failure does it retry row by row.
 *
 * @param {Array<{recipientId: string, type?: string, gameCode?: string|null, title: string, body: string, payload?: object}>} notifications
 */
export async function createNotifications(notifications = []) {
  const rows = notifications
    .map((item) => ({
      recipientId: toRecipientId(item?.recipientId),
      type: String(item?.type || 'system').slice(0, 40),
      gameCode: item?.gameCode ? String(item.gameCode).toUpperCase().slice(0, 20) : null,
      title: String(item?.title || '').slice(0, 200),
      body: String(item?.body || '').slice(0, 2000),
      payload: item?.payload && typeof item.payload === 'object' ? item.payload : {},
    }))
    .filter((item) => item.recipientId && item.title && item.body);

  if (!rows.length) return [];

  try {
    return await insertNotifications(rows);
  } catch (error) {
    if (rows.length === 1) throw error;
    console.error('[Notifications] Batch insert failed, retrying per recipient:', error.message);

    const delivered = [];
    for (const row of rows) {
      try {
        delivered.push(...(await insertNotifications([row])));
      } catch (rowError) {
        console.error(`[Notifications] Dropped notification for ${row.recipientId}:`, rowError.message);
      }
    }
    // Nothing landed at all, so this is a broken write path rather than one
    // bad recipient. Surface it instead of reporting a silent success.
    if (!delivered.length) throw error;
    return delivered;
  }
}

/** Latest notifications for one account, newest first. */
export async function listNotifications(recipientId, { limit = 30 } = {}) {
  const safeRecipient = toRecipientId(recipientId);
  if (!safeRecipient) return [];
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 30, 1), MAX_LIST_LIMIT);
  const result = await query(
    `SELECT id, type, game_code, title, body, payload, read_at, created_at
     FROM notifications
     WHERE recipient_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [safeRecipient, safeLimit]
  );
  return result.rows;
}

export async function countUnreadNotifications(recipientId) {
  const safeRecipient = toRecipientId(recipientId);
  if (!safeRecipient) return 0;
  const result = await query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
    [safeRecipient]
  );
  return Number(result.rows[0]?.count) || 0;
}

/**
 * Marks inbox entries read. `{ all: true }` clears the whole inbox; otherwise
 * only the listed ids are touched, and always scoped to the caller's own rows.
 */
export async function markNotificationsRead(recipientId, { all = false, ids = [] } = {}) {
  const safeRecipient = toRecipientId(recipientId);
  if (!safeRecipient) return 0;

  if (all) {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = $1 AND read_at IS NULL',
      [safeRecipient]
    );
  } else {
    const safeIds = (Array.isArray(ids) ? ids : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 200);
    if (!safeIds.length) return countUnreadNotifications(safeRecipient);
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL',
      [safeRecipient, safeIds]
    );
  }

  return countUnreadNotifications(safeRecipient);
}
