import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../db/query.js', () => ({
  query: async () => ({ rows: [{ user_id: 'user-42', expires_at: '2099-01-01' }] }),
}));

vi.mock('../services/puzzleService.js', () => ({
  default: {},
}));

import { query } from '../db.js';

function buildApp(routes) {
  const app = express();
  app.use(express.json());
  app.use('/api/puzzles', routes);
  return app;
}

function loopback(app, method, path, headers = { cookie: 'chess_session=test-session' }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
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
            resolve({ status: res.statusCode, body: parsed });
          })
        );
      });
      req.on('error', (e) => server.close(() => reject(e)));
      req.end();
    });
  });
}

let app;

beforeEach(async () => {
  vi.clearAllMocks();
  app = buildApp((await import('./puzzles.js')).default);
});

describe('GET /api/puzzles/streak', () => {
  it('returns the account streak', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 6, best_streak: 9, last_solved_on: '2026-11-17', solved_today: true }],
    });

    const res = await loopback(app, 'GET', '/api/puzzles/streak');

    expect(res.status).toBe(200);
    expect(res.body.streak).toEqual({
      currentStreak: 6,
      bestStreak: 9,
      lastSolvedOn: '2026-11-17',
      solvedToday: true,
    });
    expect(query.mock.calls[0][1]).toEqual(['user-42']);
  });

  it('requires an account — a guest has no streak to read', async () => {
    const res = await loopback(app, 'GET', '/api/puzzles/streak', {});
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/puzzles/streak', () => {
  it('records the solve and returns the new streak', async () => {
    query.mockResolvedValueOnce({
      rows: [{ current_streak: 7, best_streak: 9, last_solved_on: '2026-11-17', solved_today: true }],
    });

    const res = await loopback(app, 'POST', '/api/puzzles/streak');

    expect(res.status).toBe(200);
    expect(res.body.streak.currentStreak).toBe(7);
    expect(res.body.streak.solvedToday).toBe(true);
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO puzzle_streak/);
    expect(query.mock.calls[0][1]).toEqual(['user-42']);
  });

  it('refuses a guest write', async () => {
    const res = await loopback(app, 'POST', '/api/puzzles/streak', {});
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
