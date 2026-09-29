import { describe, it, expect } from 'vitest';
import {
  REACTIONS,
  reactionEmoji,
  displayChatBody,
} from './onlineReactions';

describe('onlineReactions', () => {
  it('maps every reaction word to a distinct emoji', () => {
    const emojis = REACTIONS.map((r) => r.emoji);
    expect(emojis).toHaveLength(new Set(emojis).size);
    for (const { word, emoji } of REACTIONS) {
      expect(reactionEmoji(word)).toBe(emoji);
    }
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(reactionEmoji('sweat')).toBe('😅');
    expect(reactionEmoji(' Party ')).toBe('🎉');
  });

  it('returns null for unknown words and non-strings', () => {
    expect(reactionEmoji('HELLO')).toBeNull();
    expect(reactionEmoji('')).toBeNull();
    expect(reactionEmoji(null)).toBeNull();
    expect(reactionEmoji(42)).toBeNull();
  });

  it('turns a bare reaction word into its emoji for chat display', () => {
    expect(displayChatBody('SWEAT')).toBe('😅');
    expect(displayChatBody('wow')).toBe('😮');
  });

  it('leaves normal chat text untouched', () => {
    expect(displayChatBody('good luck, have fun')).toBe(
      'good luck, have fun',
    );
    expect(displayChatBody('that SWEAT was loud')).toBe(
      'that SWEAT was loud',
    );
    expect(displayChatBody('')).toBe('');
  });
});
