import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  LESSON_CATALOG,
  LESSON_DIFFICULTIES,
  getLessonById,
  getLessonsByDifficulty,
  getLessonParagraphs,
} from './lessonCatalog';

function assertValidFen(fen) {
  expect(() => new Chess(fen)).not.toThrow();
}

function assertValidPgn(pgn) {
  expect(() => new Chess().loadPgn(pgn)).not.toThrow();
}

describe('lessonCatalog', () => {
  it('contains 6-8 lessons', () => {
    expect(LESSON_CATALOG.length).toBeGreaterThanOrEqual(6);
    expect(LESSON_CATALOG.length).toBeLessThanOrEqual(8);
  });

  it('has unique lesson ids', () => {
    const ids = LESSON_CATALOG.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique sequential order values starting at 1', () => {
    const orders = LESSON_CATALOG.map((lesson) => lesson.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, index) => index + 1));
  });

  it('uses valid difficulty values', () => {
    for (const lesson of LESSON_CATALOG) {
      expect(LESSON_DIFFICULTIES).toContain(lesson.difficulty);
    }
  });

  it('has non-empty titles, topics and descriptions', () => {
    for (const lesson of LESSON_CATALOG) {
      expect(lesson.title.trim()).not.toBe('');
      expect(lesson.topic.trim()).not.toBe('');
      expect(lesson.description.length).toBeGreaterThan(0);
      for (const paragraph of lesson.description) {
        expect(typeof paragraph).toBe('string');
        expect(paragraph.trim()).not.toBe('');
      }
    }
  });

  it('provides a valid exampleFen or examplePgn for every lesson', () => {
    for (const lesson of LESSON_CATALOG) {
      const hasFen = Boolean(lesson.exampleFen);
      const hasPgn = Boolean(lesson.examplePgn);
      expect(hasFen || hasPgn).toBe(true);
      if (hasFen) assertValidFen(lesson.exampleFen);
      if (hasPgn) assertValidPgn(lesson.examplePgn);
    }
  });

  it('has a non-empty exampleExplanation and puzzleThemes when present', () => {
    for (const lesson of LESSON_CATALOG) {
      expect(lesson.exampleExplanation.trim()).not.toBe('');
      expect(Array.isArray(lesson.puzzleThemes)).toBe(true);
      expect(lesson.puzzleThemes.length).toBeGreaterThan(0);
    }
  });

  it('covers each of the eight planned topics', () => {
    const topics = LESSON_CATALOG.map((lesson) => lesson.topic);
    expect(topics).toEqual(expect.arrayContaining([
      'Opening',
      'Strategy',
      'King Safety',
      'Tactics',
      'Tactics',
      'Tactics',
      'Tactics',
      'Checkmate',
    ]));
  });

  it('getLessonById finds lessons by slug id', () => {
    expect(getLessonById('forks')).toBe(LESSON_CATALOG[4]);
    expect(getLessonById('does-not-exist')).toBeNull();
  });

  it('getLessonsByDifficulty returns only matching lessons in order', () => {
    const beginners = getLessonsByDifficulty('beginner');
    expect(beginners.every((lesson) => lesson.difficulty === 'beginner')).toBe(true);
    expect(beginners.map((lesson) => lesson.order)).toEqual([1, 2, 3]);

    const intermediates = getLessonsByDifficulty('intermediate');
    expect(intermediates.map((lesson) => lesson.order)).toEqual([4, 5, 6, 7, 8]);
  });

  it('getLessonParagraphs normalizes string and array descriptions', () => {
    const arrayLesson = LESSON_CATALOG[0];
    expect(getLessonParagraphs(arrayLesson)).toEqual(arrayLesson.description);

    expect(getLessonParagraphs({ content: 'para one\n\npara two' })).toEqual([
      'para one',
      'para two',
    ]);
    expect(getLessonParagraphs({ description: 'single paragraph' })).toEqual(['single paragraph']);
    expect(getLessonParagraphs(null)).toEqual([]);
  });
});
