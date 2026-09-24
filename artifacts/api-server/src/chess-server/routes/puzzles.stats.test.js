import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(),
}));

// Keep the route module light: only the stats endpoints under test touch the DB.
vi.mock('../services/puzzleService.js', () => ({
  default: {},
}));

import { query } from '../db.js';
import { authenticatedUserId } from '../coachAuth.js';

let puzzleRoutes;

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const hasBody = body !== undefined && method !== 'GET';
      const data = hasBody ? JSON.stringify(body) : '';
      const reqHeaders = {};
      if (hasBody) {
        reqHeaders['content-type'] = 'application/json';
        reqHeaders['content-length'] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers: reqHeaders },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => server.close(() => {
            let parsed;
            try { parsed = JSON.parse(buf); } catch { parsed = buf; }
            resolve({ status: res.statusCode, body: parsed });
          }));
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      if (hasBody) req.write(data);
      req.end();
    });
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  puzzleRoutes = (await import('./puzzles.js')).default;
});

describe('GET /api/puzzles/stats/user', () => {
  it('requires authentication', async () => {
    authenticatedUserId.mockResolvedValue(null);
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'GET', '/api/puzzles/stats/user');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns empty stats for a user with no saved row', async () => {
    authenticatedUserId.mockResolvedValue('user_1');
    query.mockResolvedValue({ rows: [] });
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'GET', '/api/puzzles/stats/user');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toEqual({
      solvedCount: 0,
      attemptedCount: 0,
      currentStreak: 0,
      bestStreak: 0,
      rating: 400,
      updatedAt: null,
    });
  });

  it('returns the saved stats for the caller', async () => {
    authenticatedUserId.mockResolvedValue('user_1');
    query.mockResolvedValue({
      rows: [{
        solved_count: 7, attempted_count: 10, current_streak: 3,
        best_streak: 9, rating: 1200, updated_at: '2026-09-24T10:00:00.000Z',
      }],
    });
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'GET', '/api/puzzles/stats/user');

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      solvedCount: 7,
      attemptedCount: 10,
      currentStreak: 3,
      bestStreak: 9,
      rating: 1200,
      updatedAt: '2026-09-24T10:00:00.000Z',
    });
    expect(query.mock.calls[0][1]).toEqual(['user_1']);
  });
});

describe('PUT /api/puzzles/stats/user', () => {
  it('requires authentication', async () => {
    authenticatedUserId.mockResolvedValue(null);
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'PUT', '/api/puzzles/stats/user', {
      solvedCount: 1, attemptedCount: 1, currentStreak: 1, bestStreak: 1, rating: 480,
    });

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects non-numeric fields', async () => {
    authenticatedUserId.mockResolvedValue('user_1');
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'PUT', '/api/puzzles/stats/user', {
      solvedCount: 'seven', attemptedCount: 1, currentStreak: 1, bestStreak: 1, rating: 480,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/solvedCount must be a finite number/);
    expect(query).not.toHaveBeenCalled();
  });

  it('upserts the stats and returns the saved row', async () => {
    authenticatedUserId.mockResolvedValue('user_1');
    query.mockResolvedValue({
      rows: [{
        solved_count: 1, attempted_count: 1, current_streak: 1,
        best_streak: 1, rating: 480, updated_at: '2026-09-24T12:00:00.000Z',
      }],
    });
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    const res = await loopback(app, 'PUT', '/api/puzzles/stats/user', {
      solvedCount: 1, attemptedCount: 1, currentStreak: 1, bestStreak: 1, rating: 480,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats.solvedCount).toBe(1);
    expect(res.body.stats.rating).toBe(480);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(params).toEqual(['user_1', 1, 1, 1, 1, 480]);
  });

  it('clamps out-of-range values before writing', async () => {
    authenticatedUserId.mockResolvedValue('user_1');
    query.mockResolvedValue({
      rows: [{
        solved_count: 0, attempted_count: 0, current_streak: 0,
        best_streak: 0, rating: 400, updated_at: '2026-09-24T12:00:00.000Z',
      }],
    });
    const app = buildApp();
    app.use('/api/puzzles', puzzleRoutes);

    await loopback(app, 'PUT', '/api/puzzles/stats/user', {
      solvedCount: -5, attemptedCount: 3.7, currentStreak: 2, bestStreak: 2, rating: 99999,
    });

    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['user_1', 0, 3, 2, 2, 4000]);
  });
});
