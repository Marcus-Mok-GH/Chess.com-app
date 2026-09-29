/**
 * Resolves the player's color choice for a bot game.
 *
 * PlaySetup stores the symbolic selection ('w' | 'b' | 'random'); the concrete
 * color is rolled at game start so a reroll can be triggered via "New Game".
 */

const COLORS = ['w', 'b'];

export function resolvePlayerColor(color) {
  if (color === 'w' || color === 'b') return color;
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

/**
 * Resolves the player's color choice for a friendly online game.
 *
 * The lobby stores 'white' | 'black' | 'random'; the concrete color is rolled
 * before the create call because the server assigns seats from it.
 */

const ONLINE_COLORS = ['white', 'black'];

export function resolveOnlinePlayerColor(color) {
  if (color === 'white' || color === 'black') return color;
  return ONLINE_COLORS[Math.floor(Math.random() * ONLINE_COLORS.length)];
}
