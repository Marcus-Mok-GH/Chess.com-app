// @vitest-environment node
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { render } from '../entry-server';
import { LESSON_CATALOG } from '../engine/lessons/lessonCatalog';

// Lets one test simulate the lesson-puzzle generator breaking while the
// daily streak card (which requests `type`, not `difficulty`) keeps working.
const generatorControl = vi.hoisted(() => ({ failLessonGeneration: false }));

vi.mock('../engine/puzzles/puzzleGenerator', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generatePuzzle: vi.fn((seed, options = {}) => {
      if (
        generatorControl.failLessonGeneration &&
        'difficulty' in options &&
        !('type' in options)
      ) {
        throw new Error('seeded generator failure');
      }
      return actual.generatePuzzle(seed, options);
    }),
  };
});

/**
 * Extracts the puzzle payload the page embeds as an inline script so the
 * client bundle can adopt the exact board the server rendered.
 */
function extractInitialPuzzle(html) {
  const match = html.match(/window\["__INITIAL_PUZZLE__"\]=([\s\S]*?);<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

beforeEach(() => {
  generatorControl.failLessonGeneration = false;
});

describe('Puzzle page server-side rendering', () => {
  it('serves a fully rendered puzzle board with an adoptable payload on /puzzles', async () => {
    const startedAt = Date.now();
    const html = await render('/puzzles');
    const renderMs = Date.now() - startedAt;

    // The page shell and lesson content are part of the initial HTML.
    expect(html).toContain('puzzles-page');
    expect(html).toContain(LESSON_CATALOG[0].title);

    // The board itself is server-rendered (pieces ship as custom images)
    // instead of the old "Preparing lesson puzzle…" placeholder.
    expect(html).not.toContain('puzzle-board-loading');
    expect(html).not.toContain('Preparing lesson puzzle');
    expect(html).toContain('/custom-pieces/');

    // The same puzzle is embedded for the client to adopt on its first
    // render: a real, parseable position with a playable solution.
    const payload = extractInitialPuzzle(html);
    expect(payload).toBeTruthy();
    expect(payload.lessonIndex).toBe(0);
    expect(payload.puzzle.lessonIndex).toBe(0);
    expect(payload.puzzle.lessonTitle).toBe(LESSON_CATALOG[0].title);
    expect(payload.puzzle.difficulty).toBe('beginner');
    const chess = new Chess(payload.puzzle.fen);
    expect(chess.move(payload.puzzle.solution)).toBeTruthy();

    // The payload sits in a classic inline script, so it must never contain
    // a raw "<" that could close the tag early; "<" ships as \u003c instead.
    const scriptSource = html
      .slice(html.indexOf('window["__INITIAL_PUZZLE__"]'))
      .split('</script>')[0];
    expect(scriptSource).not.toContain('<');

    // SSR must stay interactive: generation costs ~170ms per call here, so
    // anything approaching seconds means a slow path (e.g. the themed
    // search's 50 full attempts, ~3.5s) snuck in front of rendering.
    expect(renderMs).toBeLessThan(3000);
  });

  it('embeds the payload for the lesson requested in the URL', async () => {
    const lesson = LESSON_CATALOG[2];
    const html = await render(`/puzzles?lesson=${lesson.id}`);

    expect(html).toContain(lesson.title);
    const payload = extractInitialPuzzle(html);
    expect(payload.lessonIndex).toBe(2);
    expect(payload.puzzle.lessonIndex).toBe(2);
    expect(payload.puzzle.lessonTitle).toBe(lesson.title);
  });

  it('falls back to the loading placeholder when server-side generation fails', async () => {
    generatorControl.failLessonGeneration = true;

    const html = await render('/puzzles');

    // Degrades to the previous behaviour (placeholder + client-side
    // generation) instead of failing the whole SSR response.
    expect(html).toContain('puzzle-board-loading');
    expect(html).not.toContain('__INITIAL_PUZZLE__');
  });

  it('does not embed a puzzle payload on other pages', async () => {
    const html = await render('/home');
    expect(html).not.toContain('__INITIAL_PUZZLE__');
  });
});
