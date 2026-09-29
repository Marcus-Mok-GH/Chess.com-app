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
