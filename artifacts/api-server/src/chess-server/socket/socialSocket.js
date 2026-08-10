import { query } from '../db.js';
import { censorMessage } from './profanity.js';
import { markOnline, markOffline } from './presence.js';

const SOCIAL_ROOM_PREFIX = 'chat:';
const CHAT_BODY_LIMIT = 500;
const CHAT_ROOM_LIMIT = 50;

function normalizeRoom(room) {
  if (typeof room !== 'string') return '';
  const trimmed = room.trim().toLowerCase();
  if (!trimmed || trimmed.length > CHAT_ROOM_LIMIT) return '';
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Socket chat + presence handlers for the social layer. Additive only: they do
// not touch matchmaking or game events. A user id is resolved from the outgoing
// authenticated user info passed by the client (the socket layer authenticates
// via complete_remote_login rather than a per-socket bearer token).
export function setupSocialHandlers(io, socket) {
  // Chat room membership
  socket.on('chat:join', (data) => {
    const room = normalizeRoom(data?.room);
    if (!room) return;
    socket.join(`${SOCIAL_ROOM_PREFIX}${room}`);
  });

  socket.on('chat:leave', (data) => {
    const room = normalizeRoom(data?.room);
    if (!room) return;
    socket.leave(`${SOCIAL_ROOM_PREFIX}${room}`);
  });

  // Lobby chat send + broadcast
  socket.on('chat:send', async (data) => {
    const { room, body, user } = data || {};
    const normalizedRoom = normalizeRoom(room);
    if (!normalizedRoom) return;
    const normalizedBody = typeof body === 'string' ? body.trim().slice(0, CHAT_BODY_LIMIT) : '';
    if (!normalizedBody) {
      socket.emit('chat:error', { room: normalizedRoom, message: 'Message cannot be empty' });
      return;
    }
    const userId = typeof user?.id === 'string' ? user.id : '';
    const username = typeof user?.username === 'string' ? user.username : 'guest';
    const safeRoom = normalizedRoom.replace(/[^a-zA-Z0-9_-]/g, '_');

    let message;
    try {
      const res = await query(
        `INSERT INTO chat_messages (user_id, username, room, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, username, room, body, created_at`,
        [userId || null, username, safeRoom, censorMessage(normalizedBody)]
      );
      message = res.rows[0];
    } catch (error) {
      console.error('[Social/chat] Failed to persist message:', error);
      socket.emit('chat:error', { room: safeRoom, message: 'Failed to send message' });
      return;
    }

    const payload = {
      id: message.id,
      userId: message.user_id,
      username: message.username,
      room: message.room,
      body: message.body,
      timestamp: message.created_at instanceof Date
        ? message.created_at.toISOString()
        : message.created_at,
    };

    // Forward to everyone in the room, including the sender (server echo so the
    // client can rely on the persisted message rather than optimistic local state).
    io.in(`${SOCIAL_ROOM_PREFIX}${safeRoom}`).emit('chat:message', payload);
    socket.emit('chat:ack', payload);
  });

  // Presence: track the connected socket for a logged-in user. The REST friends
  // list reads this map to derive `online` flags without a second round-trip.
  socket.on('presence:join', (data) => {
    const userId = data?.userId;
    if (!userId) return;
    markOnline(userId, socket.id, data?.username || '');
    socket.data.userId = userId;
    io.emit('user:online', { userId, username: data?.username || '', socketId: socket.id });
  });

  socket.on('presence:leave', () => {
    markOffline(socket.id);
    io.emit('user:offline', { socketId: socket.id });
  });

  // Clean up presence state if the socket disconnects without an explicit leave.
  socket.on('disconnect', () => {
    const removed = markOffline(socket.id);
    if (removed) {
      io.emit('user:offline', { socketId: socket.id });
    }
  });
}

export { SOCIAL_ROOM_PREFIX };
