import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(),
}));

import { query } from '../db.js';
import usersRoutes from './users.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRoutes);
  return app;
}

function get(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, path, method: 'GET' },
        (res) => {
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
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      req.end();
    });
  });
}

const ROW = {
  username: 'alice',
  elo: 1300,
  rapid_elo: 1500,
  classical_elo: 1100,
  blitz_elo: 1250,
  games_played: 10,
  wins: 5,
  losses: 3,
  draws: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/users/leaderboard/top', () => {
  it('ranks by the untimed pool by default and returns every rating', async () => {
    query.mockResolvedValue({ rows: [ROW] });

    const res = await get(buildApp(), '/api/users/leaderboard/top');

    expect(res.status).toBe(200);
    expect(res.body.timeControl).toBe('unlimited');
    expect(res.body.leaderboard[0]).toMatchObject({
      rank: 1,
      username: 'alice',
      elo: 1300,
      rapidElo: 1500,
      classicalElo: 1100,
      blitzElo: 1250,
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY elo DESC');
    expect(params).toEqual([10]);
  });

  it('ranks the rapid pool for ?timeControl=rapid', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await get(
      buildApp(),
      '/api/users/leaderboard/top?timeControl=rapid&limit=5'
    );

    expect(res.body.timeControl).toBe('rapid');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ORDER BY rapid_elo DESC');
    expect(params).toEqual([5]);
  });

  it('ranks the classical pool for ?timeControl=classical', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await get(
      buildApp(),
      '/api/users/leaderboard/top?timeControl=classical'
    );

    expect(res.body.timeControl).toBe('classical');
    expect(query.mock.calls[0][0]).toContain('ORDER BY classical_elo DESC');
  });

  it('ranks the blitz pool for both ?timeControl=blitz and blitz_3_2', async () => {
    query.mockResolvedValue({ rows: [] });
    const app = buildApp();

    const flat = await get(app, '/api/users/leaderboard/top?timeControl=blitz');
    expect(flat.body.timeControl).toBe('blitz');
    expect(query.mock.calls[0][0]).toContain('ORDER BY blitz_elo DESC');

    query.mockClear();
    query.mockResolvedValue({ rows: [] });

    const increment = await get(
      app,
      '/api/users/leaderboard/top?timeControl=blitz_3_2'
    );
    expect(increment.body.timeControl).toBe('blitz_3_2');
    expect(query.mock.calls[0][0]).toContain('ORDER BY blitz_elo DESC');
  });

  it('normalizes an unknown control to the untimed pool', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await get(
      buildApp(),
      '/api/users/leaderboard/top?timeControl=bullet'
    );

    expect(res.body.timeControl).toBe('unlimited');
    expect(query.mock.calls[0][0]).toContain('ORDER BY elo DESC');
  });
});

describe('GET /api/users/:username', () => {
  it('returns every per-control rating', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'u1',
          username: 'bob',
          elo: 1210,
          rapid_elo: 1450,
          classical_elo: 1350,
          blitz_elo: 1280,
          games_played: 4,
          wins: 2,
          losses: 1,
          draws: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await get(buildApp(), '/api/users/bob');

    expect(res.status).toBe(200);
    expect(res.body.elo).toBe(1210);
    expect(res.body.rapidElo).toBe(1450);
    expect(res.body.classicalElo).toBe(1350);
    expect(res.body.blitzElo).toBe(1280);
  });
});
