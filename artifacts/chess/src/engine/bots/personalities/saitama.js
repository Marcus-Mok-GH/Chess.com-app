const calmQuotes = {
  start: [
    'Hey. I\'ll take it easy — I\'m just here for fun.',
    'No rush, take your time. I\'ve got nowhere to be.',
    'I\'m not really trying. That\'s kind of the point.',
    'Let\'s keep this calm. You move a piece, I move a piece.',
  ],
  win: [
    'Oh. I won. Huh. Nice, I guess.',
    'Good game. I barely woke up for that one.',
    'Victory. Cool. Is it lunchtime yet?',
    'GG. You were close, to be fair.',
  ],
  lose: [
    'You got me. Nice moves, honestly.',
    'Good game! I wasn\'t really trying, but still.',
    'You actually beat me. Respect.',
    'Well played. Rematch someday. Maybe.',
  ],
  check: [
    'Oh, check. Sorry, it just sort of happened.',
    'Check. No big deal, just move your king.',
    'Huh, check. I wasn\'t even aiming for that.',
    'Check. Your turn. Take your time.',
  ],
  capture: [
    'Oh, I took that. Sorry about your piece.',
    'I\'ll just have this one. Nothing personal.',
    'Took it. It was right there, you know.',
    'Free piece. Nice. Sorry though.',
  ],
  captured: [
    'You got my piece. Fair enough.',
    'Oh, that one\'s gone. No worries.',
    'Nice capture. That\'s the game, I guess.',
    'Huh. Didn\'t expect that. Good one.',
  ],
  thinking: [
    'Hmm. Maybe this one. It\'s fine either way.',
    'Whatever move is fine. Just passing the time.',
    'Thinking... or not. Same result, probably.',
    'Yawn. Let\'s see what happens.',
  ],
  goodMove: [
    'That was a good move. I like it.',
    'Solid stuff. You\'re not bad at this.',
    'Huh, neat. Didn\'t see that coming.',
    'Good move. Keep going, this is fun.',
  ],
  blunder: [
    'Oops. That was sloppy. Oh well.',
    'Yeah, that was bad. Moving on.',
    'Eh, we all do that sometimes.',
    'Not my best. Anyway.',
  ],
  draw: [
    'A draw. Perfect — nobody has to feel bad.',
    'Even game. Let\'s leave it there.',
    'Half a point each. Works for me.',
    'A draw. Cool. No one\'s upset.',
  ],
};

const awakenedQuotes = {
  start: [
    'No more warm-ups. We begin now.',
    'You wanted the real thing. Here it is.',
    'Enough. Let\'s finish this.',
    'Okay. Serious mode.',
  ],
  // Shown the moment the opponent earns the awakening.
  awakened: [
    'Oh. You shouldn\'t have done that.',
    'Okay. Serious mode. It\'s over.',
    'You touched my pieces. That was the mistake.',
    'One punch. That\'s all this takes.',
  ],
  win: [
    'Checkmate. One punch, as usual.',
    'That\'s it. Told you it would end fast.',
    'You had my attention for a whole minute. Impressive.',
    'GG. You woke the wrong bot.',
  ],
  lose: [
    'You have to be cheating. Rematch. Now.',
    'Impossible. I was going easy. I WAS GOING EASY.',
    'Fine, you got lucky. Enjoy it while it lasts.',
    'That shouldn\'t happen. Rematch. Immediately.',
  ],
  check: [
    'Check. Nowhere to run from here.',
    'Check. This is the end. You just can\'t see it yet.',
    'Check. One more move and it\'s over.',
    'Check. Run. It won\'t help.',
  ],
  capture: [
    'Taken. Like it was never there.',
    'Mine. Don\'t bother recapturing.',
    'That piece was a gift to myself.',
    'Gone. Next.',
  ],
  captured: [
    'Irrelevant. I take yours back in one punch.',
    'A minor inconvenience. Nothing more.',
    'Even losing material, I don\'t lose games.',
    'Hm. Noted. You won\'t get another one.',
  ],
  thinking: [
    'Finding the fastest way to end this.',
    'Calculating. This won\'t take long.',
    'One move. That\'s all I need.',
    'I see it. It\'s already over.',
  ],
  goodMove: [
    'Decent. It changes nothing.',
    'Good move. It only delays it.',
    'Not bad. Won\'t save you.',
    'Fine move. Now watch.',
  ],
  blunder: [
    'A slip. It won\'t matter.',
    'You get that one. Now watch.',
    'Irrelevant. One punch is still coming.',
    'Doesn\'t matter. Ending this now.',
  ],
  draw: [
    'A draw? Unacceptable.',
    'We don\'t stop at half a point. Rematch.',
    'Even. This doesn\'t count.',
    'A draw. I\'m not done with you yet.',
  ],
};

export const saitama = {
  id: 'saitama',
  name: 'Saitama',
  rating: 2500,
  ratingDisplay: 'C-Class',
  avatar: '😴',
  color: '#F4C430',
  depth: 3,
  nodes: 4000,
  blunderChance: 0.1,
  missedTacticsChance: 0.25,
  // A quiet King's Indian setup: Saitama develops calmly instead of attacking
  // while the opponent has not yet given him a reason to care.
  scriptedOpening: {
    name: 'The Morning Stretch',
    byColor: {
      w: {
        1: 'g1f3',
        2: 'g2g3',
        3: 'f1g2',
        4: 'e1g1',
      },
      b: {
        1: 'g8f6',
        2: 'g7g6',
        3: 'f8g7',
        4: 'e8g8',
      },
    },
  },
  personality: 'Caped baldy',
  description: 'Plays it cool until you take his material or check his king — then one punch ends the game',
  playStyle: {
    aggression: 0.1,
    materialistic: 0.45,
    tactical: 0.35,
    positional: 0.6,
    drawTolerance: 0.9,
    favorsCenter: 0.4,
    kingSafety: 0.8,
    development: 0.7,
  },
  quotes: calmQuotes,
  // Triggered the moment the opponent captures one of his pieces or gives
  // check: from then on he plays at maximum strength and talks like it.
  awakening: {
    depth: 20,
    nodes: 1000000,
    blunderChance: 0,
    missedTacticsChance: 0,
    maxStrength: true,
    scriptedOpening: undefined,
    avatar: '😤',
    ratingDisplay: '???',
    playStyle: {
      aggression: 1,
      materialistic: 0.9,
      tactical: 1,
      positional: 0.95,
      drawTolerance: 0,
      favorsCenter: 0.9,
      kingSafety: 0.9,
      development: 0.9,
      sharp: 1,
    },
    quotes: awakenedQuotes,
  },
};