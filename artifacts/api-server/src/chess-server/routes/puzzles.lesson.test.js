import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { Chess } from 'chess.js';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(async () => null),
}));

// Keep the route module light: only the lesson endpoint under test needs the
// real (shared) puzzle generator.
vi.mock('../services/puzzleService.js', () => ({
  default: {},
}));

function buildApp(routes) {
  const app = express();
  app.use(express.json());
  app.use('/api/puzzles', routes);
  return app;
}

function loopback(app, method, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () =>
          server.close(() => {
            let parsed;
            try {
              parsed = JSON.parse(buf);
            } catch {
              parsed = buf;
            }
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          })
        );
      });
      req.on('error', (e) => server.close(() => reject(e)));
      req.end();
    });
  });
}

let puzzleRoutes;
let app;

beforeEach(async () => {
  vi.clearAllMocks();
  puzzleRoutes = (await import('./puzzles.js')).default;
  app = buildApp(puzzleRoutes);
});

describe('GET /api/puzzles/lesson', () => {
  it('generates a playable lesson puzzle on the server', async () => {
    const res = await loopback(
      app,
      'GET',
      '/api/puzzles/lesson?lesson=king-safety&difficulty=advanced&seed=12345'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const puzzle = res.body.puzzle;
    expect(puzzle.difficulty).toBe('advanced');
    expect(puzzle.id).toBe('lesson-12345');
    expect(puzzle.lessonTitle).toBe('King Safety & Castling');
    expect(puzzle.lessonTopic).toBe('King Safety');
    expect(puzzle.lessonIndex).toBe(2);
    expect(puzzle.lessonThemes).toEqual(['Back-rank Radar', 'Knight-Supported Queen']);

    // The position parses and the solution is a legal move from it.
    const chess = new Chess(puzzle.fen);
    const move = chess.move(puzzle.solution);
    expect(move).toBeTruthy();
    expect(chess.turn() === 'w' || chess.turn() === 'b').toBe(true);
  });

  it('is deterministic for a given seed and lesson', async () => {
    const first = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins&seed=777');
    const second = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins&seed=777');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.puzzle.fen).toBe(first.body.puzzle.fen);
    expect(second.body.puzzle.solution).toBe(first.body.puzzle.solution);
  });

  it('defaults to the first difficulty and still returns a puzzle', async () => {
    const res = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=opening-development');

    expect(res.status).toBe(200);
    expect(res.body.puzzle.difficulty).toBe('beginner');
    expect(typeof res.body.puzzle.fen).toBe('string');
    expect(res.body.puzzle.solution).toBeTruthy();
  });

  it('rejects a missing, unknown, or invalid request', async () => {
    const missing = await loopback(app, 'GET', '/api/puzzles/lesson');
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/lesson is required/);

    const unknown = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=not-a-lesson');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toMatch(/Unknown lesson/);

    const badDifficulty = await loopback(
      app,
      'GET',
      '/api/puzzles/lesson?lesson=pins&difficulty=impossible'
    );
    expect(badDifficulty.status).toBe(400);
    expect(badDifficulty.body.error.message).toMatch(/difficulty must be one of/);

    const badSeed = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins&seed=abc');
    expect(badSeed.status).toBe(400);
    expect(badSeed.body.error.message).toMatch(/seed must be a number/);
  });
});
