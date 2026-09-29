import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  getSessionToken: vi.fn(),
  validateSession: vi.fn(),
  getSessionCookieToken: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));

import { query } from '../db.js';
import { getSessionToken, validateSession } from '../auth.js';
import notificationRoutes from './notifications.js';

const USER_ID = 'user-1';
const INBOX_ROW = {
  id: 7,
  type: 'cheat_confirmed',
  game_code: 'AB12CD34',
  title: 'Cheating confirmed in game AB12CD34',
  body: 'A fair-play review confirmed that Bob (Rapid · Elo 1455) used engine assistance.',
  payload: { gameCode: 'AB12CD34', link: '/review/AB12CD34' },
  read_at: null,
  created_at: '2026-09-29T10:00:00.000Z',
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  return app;
}

function loopback(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const hasBody = body !== undefined && method !== 'GET';
      const data = hasBody ? JSON.stringify(body) : '';
      const headers = {};
      if (hasBody) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers },
        (res) => {
          let buf = '';
          res.on('data', (chunk) => (buf += chunk));
          res.on('end', () => server.close(() => {
            let parsed;
            try { parsed = JSON.parse(buf); } catch { parsed = buf; }
            resolve({ status: res.statusCode, body: parsed });
          }));
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (hasBody) req.write(data);
      req.end();
    });
  });
}

function callsMatching(fragment) {
  return query.mock.calls.filter(([sql]) => String(sql).includes(fragment));
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionToken.mockReturnValue('test-token');
  validateSession.mockResolvedValue(USER_ID);
});

describe('GET /api/notifications', () => {
  it('requires a signed-in session', async () => {
    validateSession.mockResolvedValue(null);

    const res = await loopback(buildApp(), 'GET', '/api/notifications');

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns the caller's inbox and unread count", async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('ORDER BY created_at DESC')) return { rows: [INBOX_ROW] };
      if (text.includes('COUNT(')) return { rows: [{ count: 4 }] };
      return { rows: [] };
    });

    const res = await loopback(buildApp(), 'GET', '/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(4);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      id: 7,
      game_code: 'AB12CD34',
      payload: { gameCode: 'AB12CD34', link: '/review/AB12CD34' },
    });

    // Both reads are scoped to the session's user id, never a request param.
    for (const call of query.mock.calls) expect(call[1][0]).toBe(USER_ID);
  });

  it('scopes the query to the signed-in recipient', async () => {
    query.mockResolvedValue({ rows: [] });

    await loopback(buildApp(), 'GET', '/api/notifications');

    const [listSql, listParams] = callsMatching('ORDER BY created_at DESC')[0];
    expect(listSql).toContain('WHERE recipient_id = $1');
    expect(listParams).toEqual([USER_ID, 30]);
  });
});

describe('POST /api/notifications/read', () => {
  it('requires something to mark', async () => {
    const res = await loopback(buildApp(), 'POST', '/api/notifications/read', {});

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('clears the whole inbox for the caller', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('UPDATE notifications')) return { rows: [] };
      if (String(sql).includes('COUNT(')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });

    const res = await loopback(buildApp(), 'POST', '/api/notifications/read', { all: true });

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);

    const update = callsMatching('UPDATE notifications')[0];
    expect(update[1]).toEqual([USER_ID]);
    expect(update[0]).toContain('AND read_at IS NULL');
  });

  it('marks only the listed ids read', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('UPDATE notifications')) return { rows: [] };
      if (String(sql).includes('COUNT(')) return { rows: [{ count: 1 }] };
      return { rows: [] };
    });

    const res = await loopback(buildApp(), 'POST', '/api/notifications/read', { ids: [7, 9] });

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);

    const update = callsMatching('UPDATE notifications')[0];
    expect(update[1]).toEqual([USER_ID, [7, 9]]);
    expect(update[0]).toContain('recipient_id = $1');
  });
});
