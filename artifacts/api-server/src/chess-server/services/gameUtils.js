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
};

export const hasValidEloPair = (game) =>
  typeof game?.white_elo === 'number'
  && Number.isFinite(game.white_elo)
  && typeof game?.black_elo === 'number'
  && Number.isFinite(game.black_elo);