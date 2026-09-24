import { describe, expect, it } from 'vitest';
import { splitSentences, trimLessonSummary } from './lessonSummary.js';

describe('trimLessonSummary', () => {
  it('keeps a short one-sentence summary unchanged', () => {
    const summary = 'Develop your pieces and control the center.';
    expect(trimLessonSummary(summary)).toBe(summary);
  });

  it('keeps two short sentences', () => {
    const summary = 'Develop your pieces early. Castle to keep the king safe.';
    expect(trimLessonSummary(summary)).toBe(summary);
  });

  it('drops the third sentence even when all sentences are short', () => {
    const summary = 'Develop pieces early. Castle for safety. Avoid early queen raids.';
    expect(trimLessonSummary(summary)).toBe('Develop pieces early. Castle for safety.');
  });

  it('drops the second sentence when the pair exceeds the word cap', () => {
    const summary =
      'Develop your pieces toward the center and castle quickly. Avoid moving the same piece twice or bringing the queen out too early because chasing costs time.';
    const result = trimLessonSummary(summary);
    expect(result).toBe('Develop your pieces toward the center and castle quickly.');
    expect(result.split(' ').filter(Boolean).length).toBeLessThanOrEqual(22);
  });

  it('hard-trims a single runaway sentence at the word cap', () => {
    const summary =
      'The opening is where games are decided before the middle game begins so you must control the center, develop minor pieces, castle the king to safety, avoid moving one piece twice, never rush the queen out early, and resist grabbing edge pawns';
    const result = trimLessonSummary(summary);
    expect(result.endsWith('…')).toBe(true);
    expect(result.split(' ').filter(Boolean).length).toBeLessThanOrEqual(23); // 22 words + ellipsis
  });

  it('flattens and trims array descriptions', () => {
    const description = [
      'Develop each piece once, toward the center.',
      'Do not rush your queen out early, and do not grab pawns at the edge of the board while your pieces are still asleep.',
      'A simple opening routine: 1. e4 e5 2. Nf3 Nc6 3. Bc4.',
    ];
    const result = trimLessonSummary(description);
    // Sentence two (24 words) would push the pair past the cap, so only the
    // first short sentence survives.
    expect(result).toBe('Develop each piece once, toward the center.');
    expect(result.split(' ').filter(Boolean).length).toBeLessThanOrEqual(22);
  });

  it('returns an empty string for empty input', () => {
    expect(trimLessonSummary('')).toBe('');
    expect(trimLessonSummary(null)).toBe('');
    expect(trimLessonSummary(undefined)).toBe('');
    expect(trimLessonSummary([])).toBe('');
  });
});

describe('splitSentences abbreviation handling', () => {
  it('keeps single-letter abbreviations inside their sentence', () => {
    expect(trimLessonSummary('A fork attacks two pieces, e.g. a king and rook.')).toBe(
      'A fork attacks two pieces, e.g. a king and rook.'
    );
  });

  it('does not burn sentence slots on abbreviation periods', () => {
    expect(
      trimLessonSummary('A fork attacks two pieces, e.g. a king and rook. Develop pieces next.')
    ).toBe('A fork attacks two pieces, e.g. a king and rook. Develop pieces next.');
  });

  it('keeps numbered chess moves inside their sentence', () => {
    expect(splitSentences('1. e4 e5 2. Nf3 Nc6 3. Bc4.')).toEqual(['1. e4 e5 2. Nf3 Nc6 3. Bc4.']);
    expect(trimLessonSummary('1. e4 e5 2. Nf3 Nc6 3. Bc4. Develop pieces next.')).toBe(
      '1. e4 e5 2. Nf3 Nc6 3. Bc4. Develop pieces next.'
    );
  });

  it('still ends a sentence at real terminal punctuation', () => {
    expect(splitSentences('Develop early. Castle soon!')).toEqual(['Develop early.', 'Castle soon!']);
  });
});
