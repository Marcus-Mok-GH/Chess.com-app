import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(async () => null),
}));

// The lesson endpoint is the one under test; keep the rest of the route module
// light by stubbing the heavy puzzle services.
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

/** Answer the quota reads as if the visitor had already used `used` puzzles. */
function withUsedCounts(used) {
  let count = used;
  query.mockImplementation(async (sql) => {
    if (/FROM puzzle_usage/.test(sql)) return { rows: count > 0 ? [{ count }] : [] };
    if (/INSERT INTO puzzle_usage/.test(sql)) {
      count += 1;
      return { rows: [{ count }] };
    }
    return { rows: [] };
  });
}

let app;

beforeEach(async () => {
  vi.clearAllMocks();
  app = buildApp((await import('./puzzles.js')).default);
});

describe('free daily puzzle allowance', () => {
  it('serves a puzzle and charges it while under three today', async () => {
    withUsedCounts(1);
    const res = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins&seed=42');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.usage).toMatchObject({ used: 2, limit: 3, remaining: 1, allowed: true });

    const inserts = query.mock.calls.filter(([sql]) => /INSERT INTO puzzle_usage/.test(sql));
    expect(inserts).toHaveLength(1);
  });

  it('issues a device cookie for a signed-out visitor', async () => {
    withUsedCounts(0);
    const res = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins');

    expect(res.status).toBe(200);
    const setCookie = String(res.headers['set-cookie'] || '');
    expect(setCookie).toMatch(/chess_visitor=[a-f0-9]{32}/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('refuses the fourth puzzle with 402 and charges nothing', async () => {
    withUsedCounts(3);
    const res = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins');

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PUZZLE_LIMIT_REACHED');
    expect(res.body.usage).toMatchObject({ used: 3, remaining: 0, allowed: false });
    expect(res.body.usage.resetsAt).toBeTruthy();
    expect(res.body.puzzle).toBeUndefined();

    const inserts = query.mock.calls.filter(([sql]) => /INSERT INTO puzzle_usage/.test(sql));
    expect(inserts).toHaveLength(0);
  });

  it('reports usage without charging when asked', async () => {
    withUsedCounts(2);
    const res = await loopback(app, 'GET', '/api/puzzles/usage');

    expect(res.status).toBe(200);
    expect(res.body.usage).toMatchObject({ used: 2, limit: 3, remaining: 1, allowed: true });

    const inserts = query.mock.calls.filter(([sql]) => /INSERT INTO puzzle_usage/.test(sql));
    expect(inserts).toHaveLength(0);
  });

  it('serves the puzzle anyway when the counter is unavailable', async () => {
    query.mockRejectedValue(new Error('database down'));
    const res = await loopback(app, 'GET', '/api/puzzles/lesson?lesson=pins');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.usage).toBeNull();
  });
});
