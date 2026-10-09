import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(async () => null),
}));

vi.mock('../services/puzzleService.js', () => ({
  default: {},
}));

// The route module reads this when it builds its limiter, so it must be set
// before the import below.
process.env.PUZZLE_LESSON_RATE_MAX = '2';
const { default: puzzleRoutes } = await import('./puzzles.js');
delete process.env.PUZZLE_LESSON_RATE_MAX;

function loopback(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
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

describe('GET /api/puzzles/lesson rate limit', () => {
  it('caps puzzle generation per IP', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/puzzles', puzzleRoutes);

    const first = await loopback(app, '/api/puzzles/lesson?lesson=center-control&seed=1');
    const second = await loopback(app, '/api/puzzles/lesson?lesson=center-control&seed=2');
    const third = await loopback(app, '/api/puzzles/lesson?lesson=center-control&seed=3');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-ratelimit-limit']).toBe('2');

    // Generation is CPU work on a public endpoint: over-budget requests are
    // rejected instead of spinning the generator.
    expect(third.status).toBe(429);
    expect(third.body.error.message).toMatch(/Too many puzzle requests/);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });
});
