/**
 * Resolves the player's color choice for a bot game.
 *
 * PlaySetup stores the symbolic selection ('w' | 'b' | 'random'); the concrete
 * color is rolled at game start so a reroll can be triggered via "New Game".
 */

const COLORS = ['w', 'b'];

function resolveColorChoice(color, colors) {
  if (color === colors[0] || color === colors[1]) return color;
  return colors[Math.floor(Math.random() * colors.length)];
}

export function resolvePlayerColor(color) {
  return resolveColorChoice(color, COLORS);
}

/**
 * Resolves the player's color choice for a friendly online game.
 *
 * The lobby stores 'white' | 'black' | 'random'; the concrete color is rolled
 * before the create call because the server assigns seats from it.
 */

const ONLINE_COLORS = ['white', 'black'];

export function resolveOnlinePlayerColor(color) {
  return resolveColorChoice(color, ONLINE_COLORS);
}
