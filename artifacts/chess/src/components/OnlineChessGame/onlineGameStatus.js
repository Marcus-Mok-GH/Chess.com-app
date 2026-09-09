const ACTIVE_ONLINE_GAME_STATUSES = new Set(['playing', 'check']);

/**
 * Returns whether online-game actions such as draw and resign should be shown.
 * Keep terminal and transitional server states out of the action bar.
 */
export function isOnlineGameActive(status) {
  return ACTIVE_ONLINE_GAME_STATUSES.has(status);
}
