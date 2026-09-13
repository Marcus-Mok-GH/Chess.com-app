import { userIdFromPlayerId } from './gameUtils.js';

// Active-game identity is account based, not session based. Some older clients
// send player ids with a session suffix, so normalize those ids before locking
// or checking active games.
export function accountIdForPlayer(playerId) {
  const normalized = userIdFromPlayerId(playerId);
  if (normalized != null) return String(normalized);
  if (typeof playerId === 'string' && playerId.trim()) return playerId.trim();
  if (typeof playerId === 'number' && Number.isInteger(playerId)) return String(playerId);
  return null;
}

export function activeGameMatchesAccount(game, playerId) {
  const accountId = accountIdForPlayer(playerId);
  if (!accountId || !game) return false;

  return [game.white_player_id, game.black_player_id]
    .some((seatPlayerId) => accountIdForPlayer(seatPlayerId) === accountId);
}

// Advisory transaction locks serialize every operation that can create or
// claim an active game for the same account, including concurrent serverless
// requests and requests routed to different API instances.
export async function lockAccounts(client, playerIds) {
  const accountIds = [...new Set(playerIds.map(accountIdForPlayer).filter(Boolean))]
    .sort();

  for (const accountId of accountIds) {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`chess:active-game:${accountId}`]
    );
  }
}

export async function findActiveGameForAccount(client, playerId, { excludeGameId = null } = {}) {
  const accountId = accountIdForPlayer(playerId);
  if (!accountId) return null;

  const result = await client.query(
    `SELECT * FROM active_games
     WHERE status IN ('playing', 'waiting')
     ORDER BY created_at ASC`
  );

  return result.rows.find((game) =>
    (!excludeGameId || String(game.game_id) !== String(excludeGameId))
    && activeGameMatchesAccount(game, playerId)
  ) || null;
}
