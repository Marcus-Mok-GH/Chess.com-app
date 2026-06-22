export const userIdFromPlayerId = (playerId) => {
  if (typeof playerId === 'number' && Number.isInteger(playerId)) {
    return playerId > 0 ? playerId : null;
  }

  if (typeof playerId !== 'string') return null;

  if (/^\d+$/.test(playerId)) {
    const parsed = Number(playerId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const match = playerId.match(/^user_(\d+)(?:_.+)?$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const hasValidEloPair = (game) =>
  typeof game?.white_elo === 'number'
  && Number.isFinite(game.white_elo)
  && typeof game?.black_elo === 'number'
  && Number.isFinite(game.black_elo);

export const buildPlayerMoveHistory = (moveHistory, isWhite) => {
  if (!Array.isArray(moveHistory)) return [];
  const parity = isWhite ? 0 : 1;
  return moveHistory.filter((_, index) => index % 2 === parity);
};

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
};

export const verifyPlayerAuth = (socket, game, playerId) => {
  const isWhiteSocket = game.white_socket_id === socket.id;
  const isBlackSocket = game.black_socket_id === socket.id;

  if (!isWhiteSocket && !isBlackSocket) {
    return { valid: false, error: 'Unauthorized - not your game' };
  }

  if (isWhiteSocket && game.white_player_id !== playerId) {
    return { valid: false, error: 'Player ID mismatch' };
  }

  if (isBlackSocket && game.black_player_id !== playerId) {
    return { valid: false, error: 'Player ID mismatch' };
  }

  return { valid: true, color: isWhiteSocket ? 'white' : 'black' };
};
