const quotes = {
  start: [
    'Sit down. Today we play for beauty, and beauty costs material.',
    'Every piece I own is for sale, and every sale is worth it.',
    'I do not play the best move. I play the move that deserves two exclamation marks.',
  ],
  win: [
    'Style wins. The material was only ever rented.',
    'You were beaten by a sacrifice. That is the only way worth losing to.',
    'Beautiful, sound, and mine. GG.',
  ],
  lose: [
    'You refused every gift I offered. Rude, but impressive.',
    'I gave away more than the position could afford. Well played.',
    'A gambit that stopped paying. Enjoy it — it will not happen twice.',
  ],
  draw: [
    'A draw, after I offered you material all game? No romance.',
    'Even. The sacrifices cancelled out. How dull.',
    'Half a point. The engine says "equal". I say "unfinished".',
  ],
  check: [
    'Check. The exclamation marks are coming.',
    'Check — and this is only the quiet part of the sacrifice.',
    'Check. After this you may take whatever you like.',
  ],
  capture: [
    'Taken. The real present is wrapped in the threat behind it.',
    'A pawn for me, and a knight on offer for you. A trade-up.',
    'I capture, then I give back. Call it a gift with interest.',
  ],
  goodMove: [
    'A fine move. Almost worth sacrificing something yourself.',
    'Solid. You will still owe me material before this is over.',
    'Nice. Now watch what a real sacrifice looks like.',
  ],
  blunder: [
    'A blunder? Evaluation is a matter of perspective.',
    'Loose play. Somewhere in your position a brilliancy is hiding.',
    'That hurt. I will simply give away something bigger.',
  ],
  brilliant: [
    'Two exclamation marks. You are welcome.',
    'The queen, the rook, whatever it takes — the position is the reward.',
    'THAT is a sacrifice. Look at it. Really look at it.',
    'Material is temporary. This is forever.',
  ],
};

export const brilliant = {
  id: 'brilliant',
  name: 'Mr. Brilliant',
  rating: 2000,
  avatar: '🧐',
  color: '#26C2A3',
  depth: 20,
  nodes: 1000000,
  blunderChance: 0,
  missedTacticsChance: 0,
  // Signals the engine route to price every candidate move for a sound
  // sacrifice (MultiPV search) and to play the flashiest one it can afford.
  brilliant: true,
  personality: 'Brilliancy hunter',
  description: 'Hunts the "!!" every move — hands you material, keeps the evaluation, and dares you to take it',
  playStyle: {
    aggression: 0.9,
    materialistic: 0.15,
    tactical: 1,
    positional: 0.7,
    drawTolerance: 0.2,
    favorsCenter: 0.7,
    kingSafety: 0.6,
    development: 0.6,
    sharp: 0.9,
  },
  quotes,
};

export default brilliant;
