import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

// Keep the route module light: only the pool-status endpoints touch the DB.
vi.mock('../services/matchmakingService.js', () => ({
  processMatchmakingOnce: vi.fn(),
}));

vi.mock('../services/activeGameGuard.js', () => ({
  accountIdForPlayer: vi.fn(),
  findActiveGameForAccount: vi.fn(),
  lockAccounts: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  requireSession: (req, res, next) => next(),
}));

import { query } from '../db.js';

let matchmakingRoutes;

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, path, method },
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

beforeEach(async () => {
  vi.resetAllMocks();
  matchmakingRoutes = (await import('./matchmaking.js')).default;
});

describe('GET /api/matchmaking/status pool scoping', () => {
  it('returns overall and per-pool counts, and scopes to ?timeControl', async () => {
    query.mockResolvedValue({
      rows: [{ unlimited: '3', rapid: '2', total: '5' }],
    });

    const app = buildApp();
    app.use('/api/matchmaking', matchmakingRoutes);

    const all = await loopback(app, 'GET', '/api/matchmaking/status');
    expect(all.status).toBe(200);
    expect(all.body.playersInQueue).toBe(5);
    expect(all.body.timeControl).toBe(null);
    expect(all.body.pools).toEqual({ unlimited: 3, rapid: 2 });

    const rapid = await loopback(
      app,
      'GET',
      '/api/matchmaking/status?timeControl=rapid'
    );
    expect(rapid.body.playersInQueue).toBe(2);
    expect(rapid.body.timeControl).toBe('rapid');
  });

  it('normalizes an unknown control to the untimed pool', async () => {
    query.mockResolvedValue({
      rows: [{ unlimited: '4', rapid: '1', total: '5' }],
    });

    const app = buildApp();
    app.use('/api/matchmaking', matchmakingRoutes);

    const res = await loopback(
      app,
      'GET',
      '/api/matchmaking/status?timeControl=blitz'
    );

    expect(res.body.timeControl).toBe('unlimited');
    expect(res.body.playersInQueue).toBe(4);
  });
});

describe('GET /api/matchmaking/details pool scoping', () => {
  it('passes the requested pool to the distribution query', async () => {
    query.mockResolvedValue({
      rows: [
        {
          total: '2',
          below_1000: '0',
          range_1000_1500: '2',
          range_1500_2000: '0',
          above_2000: '0',
        },
      ],
    });

    const app = buildApp();
    app.use('/api/matchmaking', matchmakingRoutes);

    const res = await loopback(
      app,
      'GET',
      '/api/matchmaking/details?timeControl=rapid'
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.timeControl).toBe('rapid');
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['rapid']);
  });

  it('passes null for an unscoped request so every pool is counted', async () => {
    query.mockResolvedValue({
      rows: [
        {
          total: '5',
          below_1000: '1',
          range_1000_1500: '2',
          range_1500_2000: '1',
          above_2000: '1',
        },
      ],
    });

    const app = buildApp();
    app.use('/api/matchmaking', matchmakingRoutes);

    await loopback(app, 'GET', '/api/matchmaking/details');

    const [, params] = query.mock.calls[0];
    expect(params).toEqual([null]);
  });
});
