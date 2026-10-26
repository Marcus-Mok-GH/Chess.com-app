import { describe, expect, it } from 'vitest';
import { splitSentences, trimLessonSummary } from './lessonSummary.js';

describe('trimLessonSummary', () => {
  it('keeps Chinese concepts inside the character cap', () => {
    const summary = trimLessonSummary(
      '白方应先发展轻子并控制中心，然后连接双车。黑方也应尽快争夺中心。',
      { maxCharacters: 18 },
    );

    expect(Array.from(summary).length).toBeLessThanOrEqual(18);
    expect(summary.endsWith('。') || summary.endsWith('…')).toBe(true);
  });

  it('keeps numbered chess moves together when splitting English sentences', () => {
    expect(splitSentences('1. e4 e5. 2. Nf3 Nc6. White develops a piece.')).toEqual([
      '1. e4 e5.',
      '2. Nf3 Nc6.',
      'White develops a piece.',
    ]);
  });

  it('respects the sentence cap for English concepts', () => {
    expect(
      trimLessonSummary('White develops quickly. Black contests the centre. White attacks.', {
        maxSentences: 2,
      }),
    ).toBe('White develops quickly. Black contests the centre.');
  });
});
