/**
 * Quick reactions for online games.
 *
 * The wire format is the plain word ("GOOD", "CLAP", ...) because the reaction
 * rides the regular chat endpoint as a message body. Rendering turns it into
 * an emoji both on the reaction buttons and for reaction chat messages, so
 * opponents never see bare uppercase words like "SWEAT" in the chat.
 */

export const REACTIONS = [
  { word: 'GOOD', emoji: '👍', label: 'Send a thumbs up reaction' },
  { word: 'CLAP', emoji: '👏', label: 'Send a clapping reaction' },
  { word: 'THINK', emoji: '🤔', label: 'Send a thinking reaction' },
  { word: 'WOW', emoji: '😮', label: 'Send a wow reaction' },
  { word: 'PARTY', emoji: '🎉', label: 'Send a party reaction' },
  { word: 'SWEAT', emoji: '😅', label: 'Send a sweat reaction' },
];

const EMOJI_BY_WORD = REACTIONS.reduce((acc, r) => {
  acc[r.word] = r.emoji;
  return acc;
}, {});

/**
 * Resolves a reaction word to its emoji, case-insensitively.
 * Returns null when the word is not a known reaction.
 */
export function reactionEmoji(word) {
  if (typeof word !== 'string') return null;
  return EMOJI_BY_WORD[word.trim().toUpperCase()] || null;
}

/**
 * Renders a chat message body for display. A bare reaction word becomes its
 * emoji; any other text (including mixed prose that merely contains the word)
 * passes through untouched.
 */
export function displayChatBody(body) {
  if (typeof body !== 'string') return body;
  const emoji = reactionEmoji(body);
  return emoji ?? body;
}
