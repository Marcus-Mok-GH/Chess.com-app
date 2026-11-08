const quotes = {
  start: [
    'Sit down. We have all day. In fact, we have the whole game.',
    'I do not attack. I do not trade. I simply remain.',
    'There is no rush. The game ends when someone says so. I never say so.',
  ],
  thinking: [
    'Shuffling... carefully... so nothing ends today.',
    'Let me find the move that keeps everything exactly as it is.',
    'Hmm. A move that changes nothing. Perfect.',
  ],
  win: [
    'Oh. It ended. I did not mean to do that.',
    'Somehow, despite everything, the game ended. Apologies.',
    'You resigned? Then even I cannot keep this going.',
  ],
  lose: [
    'Finally. An ending. You were very persistent.',
    'You forced it to finish. I respect that. I also resent it.',
    'Checkmate. The one thing I was avoiding. Well played.',
  ],
  draw: [
    'A draw? Technically an ending. I will allow it this once.',
    'Half a point. Not a win, not a loss, not a continuation. Fine.',
    'The game ended in a draw. I will pretend I planned it.',
  ],
  check: [
    'Check. That was not the plan. The plan was nothing happening.',
    'Check. I apologise. I meant to do less.',
    'Oh no, a check. Now you must move. This is getting complicated.',
  ],
  capture: [
    'I took that. I had no choice. It was in the way of stalling.',
    'Taken. Please do not take anything back. The pieces must stay.',
    'A capture. A small step toward an ending. I regret it already.',
  ],
  goodMove: [
    'A fine move. If only it did not move the game forward.',
    'Good. Now watch me do almost nothing in response.',
    'Nice. The game continues. That is all I ever wanted.',
  ],
  blunder: [
    'A blunder? No. A delay tactic. The board is just... rearranged.',
    'That move was terrible. Terribly stalling, though.',
    'Oops. I meant to waste time, not material. Slight difference.',
  ],
  stall: [
    'No. Not like this. Not today. Not ever, ideally.',
    'That move would have ended the game. I declined.',
    'Mate? Stalemate? Draw? I do not accept any of them.',
    'I saw the ending coming and simply took a different turn.',
  ],
};

export const stallfish = {
  id: 'stallfish',
  name: 'Stallfish',
  rating: 1600,
  avatar: '🐟',
  color: '#5B7A8C',
  depth: 5,
  nodes: 100000,
  blunderChance: 0,
  missedTacticsChance: 0,
  // Signals the engine route to filter every candidate move for one that
  // keeps the game alive: no checkmate, stalemate, draw, threefold
  // repetition or mate-in-1 against, and the quietest, most reversible
  // shuffle on the board.
  stall: true,
  personality: 'Endless staller',
  description: 'Aggression zero. Refuses checkmate, stalemate, draws and trades — and shuffles pieces until the game outlives us both',
  playStyle: {
    aggression: 0,
    materialistic: 0.2,
    tactical: 0.1,
    positional: 0.6,
    drawTolerance: 0,
    favorsCenter: 0,
    kingSafety: 1,
    development: 0.2,
    sharp: 0,
  },
  quotes,
};

export default stallfish;
