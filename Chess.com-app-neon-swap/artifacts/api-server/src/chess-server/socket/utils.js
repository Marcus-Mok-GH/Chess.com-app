// UUID pattern (standard 8-4-4-4-12 hex format)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const userIdFromPlayerId = (playerId) => {
  if (typeof playerId === 'number' && Number.isInteger(playerId)) {
    return playerId > 0 ? playerId : null;
  }

  if (typeof playerId !== 'string' || !playerId) return null;

  // Bare numeric string (legacy)
  if (/^\d+$/.test(playerId)) {
    const parsed = Number(playerId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  // Bare UUID — return as-is (already canonical)
  if (UUID_RE.test(playerId)) return playerId;

  // user_<uuid> or user_<uuid>_<sessionSuffix>
  // e.g. "user_be827321-f624-4051-a300-63c7a52f128e"
  //      "user_be827321-f624-4051-a300-63c7a52f128e_abc123"
  const uuidMatch = playerId.match(/^user_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_.*)?$/i);
  if (uuidMatch) return uuidMatch[1];

  // Legacy user_<number> or user_<number>_<suffix>
  const numericMatch = playerId.match(/^user_(\d+)(?:_.+)?$/);
  if (numericMatch) {
    const parsed = Number(numericMatch[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};;

export const hasValidEloPair = (game) =>
  typeof game?.white_elo === 'number'
  && Number.isFinite(game.white_elo)
  && typeof game?.black_elo === 'number'
  && Number.isFinite(game.black_elo);;

export const buildPlayerMoveHistory = (moveHistory, isWhite) => {
  if (!Array.isArray(moveHistory)) return [];
  const parity = isWhite ? 0 : 1;
  return moveHistory.filter((_, index) => index % 2 === parity);
};;

export const resolveMatchMoveOwner = (game, socketId, playerId) => {
  if (!game) return { username: null, isWhite: null };

  if (socketId && game.white_socket_id === socketId) {
    return { username: game.white_player_name, isWhite: true };
  }

  if (socketId && game.black_socket_id === socketId) {
    return { username: game.black_player_name, isWhite: false };
  }

  if (playerId && game.white_player_id === playerId) {
    return { username: game.white_player_name, isWhite: true };
  }

  if (playerId && game.black_player_id === playerId) {
    return { username: game.black_player_name, isWhite: false };
  }

  return { username: null, isWhite: null };
};;

export const verifyPlayerAuth = (socket, game, playerId) => {
  const isWhiteSocket = game.white_socket_id === socket.id;
  const isBlackSocket = game.black_socket_id === socket.id;

  if (!isWhiteSocket && !isBlackSocket) {
    return { valid: false, error: 'Unauthorized - not your game' };
  }

  if (isWhiteSocket && game.white_player_id != null && game.white_player_id !== playerId) {
    return { valid: false, error: 'Player ID mismatch' };
  }

  if (isBlackSocket && game.black_player_id != null && game.black_player_id !== playerId) {
    return { valid: false, error: 'Player ID mismatch' };
  }

  return { valid: true, color: isWhiteSocket ? 'white' : 'black' };
};
