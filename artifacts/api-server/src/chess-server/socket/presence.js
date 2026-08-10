// In-memory presence tracker shared by the socket layer (write) and the
// social REST routes (read). Keyed by user id -> Set of connected socket ids,
// plus a reverse socketId -> { userId, username } map for cleanup on disconnect.
const byUser = new Map();
const bySocket = new Map();

export function markOnline(userId, socketId, username = '') {
  if (!userId || !socketId) return;
  const sockets = byUser.get(userId) || new Set();
  sockets.add(socketId);
  byUser.set(userId, sockets);
  bySocket.set(socketId, { userId, username });
}

export function isOnline(userId) {
  if (!userId) return false;
  const sockets = byUser.get(userId);
  return !!sockets && sockets.size > 0;
}

export function getOnlineUserIds() {
  return new Set(byUser.keys());
}

// Returns the user id that was removed, or null.
export function markOffline(socketId) {
  const entry = bySocket.get(socketId);
  if (!entry) return null;
  bySocket.delete(socketId);
  const sockets = byUser.get(entry.userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) byUser.delete(entry.userId);
  }
  return entry.userId;
}

// Clears all presence state. Used by tests and by cleanup routines that want a
// clean slate (e.g. server restart in single-process modes).
export function clearPresence() {
  byUser.clear();
  bySocket.clear();
}
