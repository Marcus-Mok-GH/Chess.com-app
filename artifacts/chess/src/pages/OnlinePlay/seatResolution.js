const USER_PREFIX_RE = /^user_/i;
const UUID_WITH_OPTIONAL_SESSION_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_.*)?$/i;
const NUMERIC_WITH_OPTIONAL_SESSION_RE = /^(\d+)(?:_.*)?$/;

function normalizePlayerId(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return normalized.replace(USER_PREFIX_RE, '');
}

function canonicalAccountId(value) {
  const normalized = normalizePlayerId(value);
  if (!normalized) return null;
  const uuidMatch = normalized.match(UUID_WITH_OPTIONAL_SESSION_RE);
  if (uuidMatch) return uuidMatch[1].toLowerCase();
  const numericMatch = normalized.match(NUMERIC_WITH_OPTIONAL_SESSION_RE);
  if (numericMatch) return numericMatch[1];
  return normalized;
}

/**
 * Resolve the current player's seat from server-owned IDs.
 *
 * Exact match is intentionally evaluated across both seats before any account
 * ID fallback. This matters when two browser sessions use the same account:
 * matchmaking gives each seat a session suffix, so the saved exact ID is the
 * only reliable way to distinguish White from Black after a refresh.
 */
export function resolveOnlinePlayerSeat(game, candidatePlayerIds = []) {
  const seats = [
    { color: 'white', playerId: game?.white_player_id },
    { color: 'black', playerId: game?.black_player_id },
  ].filter((seat) => seat.playerId != null);
  const candidates = candidatePlayerIds
    .map(normalizePlayerId)
    .filter(Boolean);

  const exactMatches = seats.filter((seat) => {
    const seatId = normalizePlayerId(seat.playerId);
    return seatId && candidates.includes(seatId);
  });
  if (exactMatches.length === 1) {
    return {
      color: exactMatches[0].color,
      playerId: String(exactMatches[0].playerId),
    };
  }
  if (exactMatches.length > 1) return null;

  // Legacy friendly games may store a bare account ID instead of the
  // session-specific matchmaking ID. Only use this fallback when it maps to
  // exactly one seat; guessing White would put the user on the wrong side.
  const canonicalCandidates = new Set(candidatePlayerIds.map(canonicalAccountId).filter(Boolean));
  const accountMatches = seats.filter((seat) => canonicalCandidates.has(canonicalAccountId(seat.playerId)));
  if (accountMatches.length !== 1) return null;

  return {
    color: accountMatches[0].color,
    playerId: String(accountMatches[0].playerId),
  };
}
