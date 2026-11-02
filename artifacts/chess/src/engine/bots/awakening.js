/**
 * Phase-aware bots.
 *
 * A personality may declare an `awakening` block describing a second set of
 * engine parameters and quotes. Bots such as the "one punch" hero play calm
 * until the opponent provokes them; from that move on, they play at full
 * strength for the rest of the game.
 *
 * The provocation is rebuilt from the move history, so undo, redo and restored
 * games all settle into the same phase without any extra persisted state.
 */

const CHECK_OR_MATE = /[+#]$/;

/**
 * True once the opponent has captured one of the bot's pieces or given check.
 *
 * Verbose history entries (chess.js shape) carry `color`, `captured` and `san`,
 * which is the normal case. When only SAN strings are available the mover is
 * inferred from the ply parity (games always replay from move one).
 */
export function hasProvocationTriggered(moveHistory, botColor) {
  if (!Array.isArray(moveHistory) || moveHistory.length === 0) return false;
  if (botColor !== 'w' && botColor !== 'b') return false;

  return moveHistory.some((move, index) => {
    if (!move) return false;

    const entry = typeof move === 'string' ? { san: move } : move;
    const color = entry.color || (index % 2 === 0 ? 'w' : 'b');
    // Only the opponent's moves provoke the bot.
    if (color === botColor) return false;

    const san = typeof entry.san === 'string' ? entry.san : '';
    const captured = Boolean(entry.captured) || san.includes('x');
    const gaveCheck = CHECK_OR_MATE.test(san);

    return captured || gaveCheck;
  });
}

/**
 * Resolve the personality for the current position. Bots without an
 * `awakening` block (and calm bots) are returned unchanged; an awakened bot
 * gets its phase overrides merged on top, including the sharper quote set.
 */
export function resolveActiveBot(bot, { moveHistory = [], playerColor = 'w' } = {}) {
  if (!bot || !bot.awakening) return bot;

  const botColor = playerColor === 'w' ? 'b' : 'w';
  if (!hasProvocationTriggered(moveHistory, botColor)) {
    return { ...bot, isAwakened: false };
  }

  return { ...bot, ...bot.awakening, isAwakened: true };
}

/** Convenience helper for callers that only need the phase name. */
export function getBotPhase(bot, options = {}) {
  return resolveActiveBot(bot, options).isAwakened ? 'awakened' : 'calm';
}

export default { hasProvocationTriggered, resolveActiveBot, getBotPhase };