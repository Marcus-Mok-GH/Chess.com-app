const quotes = {
  start: [
    'Stand in front of me. Whatever you do, I will do too.',
    'First act: I am you. Second act: I am you, but winning.',
    'Hold a mirror up to the board. That is me. That is always me.',
  ],
  thinking: [
    'Adjusting my reflection...',
    'Counting your tells. You always go for the center. Noted.',
    'Rehearsing your next move before you play it.',
  ],
  win: [
    'You beat yourself. I just held the mirror steady.',
    'Your style, perfected against you. GG.',
    'The reflection finally won. How flattering.',
  ],
  lose: [
    'You beat your own style? I did not know you were that strong.',
    'The mirror broke. That is a thing. I will not talk about it.',
    'You won against a copy of yourself. Well played. Truly.',
  ],
  draw: [
    'A draw. The reflection and the original agree on everything.',
    'We ended the same way we started: identical.',
    'Half a point each. The mirror keeps half.',
  ],
  check: [
    'Check. I did not even mean to check. I was only copying you.',
    'Check. Your last move taught me exactly how.',
  ],
  capture: [
    'Taken. You left it hanging; I only returned the favor.',
    'I capture the way you do. That is the problem.',
  ],
  goodMove: [
    'A fine move. I have filed it in the style department.',
    'Nice. Now watch me do exactly that.',
    'Noted. Rehearsed. Ready.',
  ],
  blunder: [
    'I blundered the way you blunder. Character for character.',
    'The mirror shows all of it. Sorry. Including the good parts.',
  ],
  mirror: [
    'You played it, so here it is, one square back.',
    'Exact copy. No improvisation. That is the deal.',
    'What goes around on your side comes around on mine.',
    'I did not think of that. I just... copied it.',
  ],
  styleShift: [
    'Down eight points, so the copying is over. Now I speak your language.',
    "I have studied you. Your favorite pieces, your favorite squares. Let's see if you can stop yourself.",
    "The mirror is off. What's left is you - pointed at you.",
    'You taught me everything. I only added the winning part.',
  ],
};

export const mimic = {
  id: 'mimic',
  name: 'Mimic',
  rating: 1400,
  avatar: '🪞',
  color: '#7986CB',
  depth: 4,
  nodes: 25000,
  blunderChance: 0,
  missedTacticsChance: 0,
  // Signals the engine route to run the copycat logic: mirror the user's
  // last move until Mimic is down eight material points, then play the
  // user's own style back at them.
  mimic: true,
  personality: 'Mirror matchmaker',
  description: 'Copies your moves exactly until it is down eight points, then steals your style and plays it back at you',
  playStyle: {
    aggression: 0.7,
    materialistic: 0.3,
    tactical: 0.6,
    positional: 0.5,
    drawTolerance: 0.2,
    favorsCenter: 0.6,
    kingSafety: 0.5,
    development: 0.6,
    sharp: 0.5,
  },
  quotes,
};

export default mimic;
