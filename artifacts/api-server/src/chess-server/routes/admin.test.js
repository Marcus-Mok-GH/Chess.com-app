import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  // Cookie-only reader used by Bearer-fallback routes.
  getSessionCookieToken: vi.fn((req) => {
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;
    for (const part of cookieHeader.split(';')) {
      const [key, ...valueParts] = part.trim().split('=');
      if (key === 'chess_session') return valueParts.join('=');
    }
    return null;
  }),
  validateSession: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionToken: vi.fn(() => 'test-token'),
}));

import { query } from '../db.js';
import { validateSession } from '../auth.js';
import adminRoutes from './admin.js';

// antiCheatService reads this env var per call, so tests can set it directly.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  return app;
}

function loopback(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const hasBody = body !== undefined && method !== 'GET';
      const data = hasBody ? JSON.stringify(body) : '';
      const headers = { Authorization: 'Bearer test-token' };
      if (hasBody) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers },
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

function selectReturns(rows) {
  query.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT')) return { rows };
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CHESS_REVIEW_ADMIN_IDS = `${ADMIN_ID},${OTHER_ADMIN_ID}`;
  validateSession.mockReset();
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  delete process.env.CHESS_REVIEW_ADMIN_IDS;
});

describe('admin routes authorization', () => {
  it('rejects unauthenticated requests', async () => {
    validateSession.mockResolvedValue(null);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users?q=al');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin sessions', async () => {
    validateSession.mockResolvedValue(USER_ID);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users?q=al');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('allows admin sessions', async () => {
    validateSession.mockResolvedValue(ADMIN_ID);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users?q=al');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/admin/users', () => {
  it('requires at least 2 characters for non-empty queries', async () => {
    validateSession.mockResolvedValue(ADMIN_ID);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users?q=a');
    expect(res.status).toBe(400);
  });

  it('lists all users when the query is empty', async () => {
    validateSession.mockResolvedValue(ADMIN_ID);
    selectReturns([
      { id: USER_ID, username: 'bobby', email: 'bobby@example.com', elo: 1200, games_played: 0, wins: 0, losses: 0, draws: 0, is_banned: false, banned_at: null, banned_reason: null, created_at: new Date().toISOString() },
    ]);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].username).toBe('bobby');
  });

  it('returns shaped users and flags admins', async () => {
    validateSession.mockResolvedValue(ADMIN_ID);
    selectReturns([
      {
        id: USER_ID,
        username: 'bobby',
        email: 'bobby@example.com',
        elo: 1500,
        games_played: 10,
        wins: 5,
        losses: 4,
        draws: 1,
        is_banned: true,
        banned_at: '2026-09-01T00:00:00.000Z',
        banned_reason: 'engine use',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const res = await loopback(buildApp(), 'GET', '/api/admin/users?q=bob');
    expect(res.status).toBe(200);
    const user = res.body.users[0];
    expect(user.username).toBe('bobby');
    expect(user.isBanned).toBe(true);
    expect(user.bannedReason).toBe('engine use');
    expect(user.isAdmin).toBe(false);
  });
});

describe('POST /api/admin/users/:id/ban', () => {
  beforeEach(() => {
    validateSession.mockResolvedValue(ADMIN_ID);
  });

  it('404s for unknown users', async () => {
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${USER_ID}/ban`);
    expect(res.status).toBe(404);
  });

  it('refuses to ban the admin themselves', async () => {
    selectReturns([{ id: ADMIN_ID, username: 'admin', is_banned: false }]);
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${ADMIN_ID}/ban`);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), expect.anything());
  });

  it('refuses to ban another admin', async () => {
    selectReturns([{ id: OTHER_ADMIN_ID, username: 'admin2', is_banned: false }]);
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${OTHER_ADMIN_ID}/ban`);
    expect(res.status).toBe(403);
  });

  it('is idempotent for already-banned users', async () => {
    selectReturns([{ id: USER_ID, username: 'bobby', is_banned: true }]);
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${USER_ID}/ban`);
    expect(res.status).toBe(200);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), expect.anything());
  });

  it('bans the user, stores the reason, and kicks sessions', async () => {
    query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT')) return { rows: [{ id: USER_ID, username: 'bobby', is_banned: false }] };
      if (sql.startsWith('UPDATE users')) {
        return {
          rows: [{
            id: USER_ID, username: 'bobby', is_banned: true,
            banned_reason: params[1], banned_at: '2026-09-01T00:00:00.000Z',
          }],
        };
      }
      return { rows: [] };
    });
    const res = await loopback(
      buildApp(), 'POST', `/api/admin/users/${USER_ID}/ban`, { reason: 'engine use' }
    );
    expect(res.status).toBe(200);
    expect(res.body.user.isBanned).toBe(true);
    expect(res.body.user.bannedReason).toBe('engine use');
    const deleteSessionCalls = query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM sessions'));
    expect(deleteSessionCalls).toHaveLength(1);
  });

  it('rejects malformed ids', async () => {
    const res = await loopback(buildApp(), 'POST', '/api/admin/users/x/ban');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/users/:id/unban', () => {
  beforeEach(() => {
    validateSession.mockResolvedValue(ADMIN_ID);
  });

  it('unbans a banned user and clears ban fields', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT')) return { rows: [{ id: USER_ID, username: 'bobby', is_banned: true }] };
      if (sql.startsWith('UPDATE users')) {
        return {
          rows: [{
            id: USER_ID, username: 'bobby', is_banned: false,
            banned_at: null, banned_reason: null,
          }],
        };
      }
      return { rows: [] };
    });
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${USER_ID}/unban`);
    expect(res.status).toBe(200);
    expect(res.body.user.isBanned).toBe(false);
    expect(res.body.user.bannedReason).toBeNull();
  });

  it('404s for unknown users', async () => {
    const res = await loopback(buildApp(), 'POST', `/api/admin/users/${USER_ID}/unban`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  beforeEach(() => {
    validateSession.mockResolvedValue(ADMIN_ID);
  });

  it('refuses to delete the admin themselves', async () => {
    selectReturns([{ id: ADMIN_ID, username: 'admin', is_banned: false }]);
    const res = await loopback(buildApp(), 'DELETE', `/api/admin/users/${ADMIN_ID}`);
    expect(res.status).toBe(403);
  });

  it('refuses to delete another admin', async () => {
    selectReturns([{ id: OTHER_ADMIN_ID, username: 'admin2', is_banned: false }]);
    const res = await loopback(buildApp(), 'DELETE', `/api/admin/users/${OTHER_ADMIN_ID}`);
    expect(res.status).toBe(403);
  });

  it('deletes the user after detaching games and sessions', async () => {
    query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT')) return { rows: [{ id: USER_ID, username: 'bobby', is_banned: false }] };
      if (sql.startsWith('DELETE FROM users')) return { rows: [{ id: params[0], username: 'bobby' }] };
      return { rows: [] };
    });
    const res = await loopback(buildApp(), 'DELETE', `/api/admin/users/${USER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted.username).toBe('bobby');
    const executed = query.mock.calls.map(([sql]) => sql);
    expect(executed).toEqual(expect.arrayContaining([
      expect.stringContaining('UPDATE games SET white_player_id = NULL'),
      expect.stringContaining('UPDATE games SET black_player_id = NULL'),
      'DELETE FROM sessions WHERE user_id = $1',
    ]));
    // Games must be detached before the user delete.
    const detachIndex = executed.findIndex((sql) => sql.startsWith('UPDATE games'));
    const deleteIndex = executed.findIndex((sql) => sql.startsWith('DELETE FROM users'));
    expect(detachIndex).toBeLessThan(deleteIndex);
  });

  it('404s for unknown users', async () => {
    const res = await loopback(buildApp(), 'DELETE', `/api/admin/users/${USER_ID}`);
    expect(res.status).toBe(404);
  });
});
