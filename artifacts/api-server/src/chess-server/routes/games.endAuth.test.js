import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  // Mirrors the real helpers: getSessionToken prefers the Bearer header,
  // getSessionCookieToken reads only the httpOnly cookie.
  getSessionCookieToken: vi.fn((req) => {
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;
    for (const part of cookieHeader.split(';')) {
      const [key, ...valueParts] = part.trim().split('=');
      if (key === 'chess_session') return valueParts.join('=');
    }
    return null;
  }),
  getSessionToken: vi.fn((req) => {
    const authorization = req?.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice(7).trim() || null;
    }
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;
    for (const part of cookieHeader.split(';')) {
      const [key, ...valueParts] = part.trim().split('=');
      if (key === 'chess_session') return valueParts.join('=');
    }
    return null;
  }),
  // 'stale-prefix' simulates the truncated session id old clients mirrored
  // into localStorage; the real cookie token maps to user 2.
  validateSession: vi.fn(async (token) => (token === 'stale-prefix' ? null : 2)),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../services/gameUtils.js', () => ({
  userIdFromPlayerId: (pid) => {
    if (!pid || typeof pid !== 'string') return null;
    const m = pid.match(/^user_(\d+)/);
    return m ? Number(m[1]) : null;
  },
  hasValidEloPair: () => true,
}));

vi.mock('../services/activeGameGuard.js', () => ({
  activeGameMatchesAccount: vi.fn(),
  findActiveGameForAccount: vi.fn(),
  lockAccounts: vi.fn(),
}));

vi.mock('../services/gameService.js', () => ({
  getGameService: vi.fn(),
}));

vi.mock('../services/antiCheatService.js', () => ({
  getIntegrityReviews: vi.fn(),
  isIntegrityReviewer: vi.fn(),
  scheduleGameAnalysis: vi.fn(),
  recordIntegrityDecision: vi.fn(),
}));

vi.mock('../services/fairPlayTelemetry.js', () => ({
  sanitizeFairPlaySignals: vi.fn((s) => s ?? {}),
  withFairPlayMetadata: vi.fn((s) => s ?? {}),
}));

vi.mock('../kv/onlineGameKv.js', () => ({
  getOnlineGameKv: vi.fn(),
}));

vi.mock('../kv/drawOfferKv.js', () => ({
  getDrawOfferKv: vi.fn(),
  DRAW_OFFER_STORAGE_ERROR: 'storage-error',
}));

import { query } from '../db.js';

let gameRoutes;

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path, body, headers = {}) {
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
      Object.assign(reqHeaders, headers);
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
  // No active game: requests that pass auth land on the 404 game lookup,
  // which is the observable proof that auth succeeded.
  query.mockResolvedValue({ rows: [] });
  gameRoutes = (await import('./games.js')).default;
});

describe('POST /api/games/:gameId/end session identity fallback', () => {
  it('falls back to the session cookie when the Bearer token is stale', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(
      app,
      'POST',
      '/api/games/GAME1/end',
      { playerId: 'user_2', result: 'black', reason: 'resignation' },
      {
        Authorization: 'Bearer stale-prefix',
        Cookie: 'chess_session=real-session-token',
      },
    );

    // Auth passed via the cookie and the request proceeded to the game lookup.
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 401 (not the mismatch 403) when the Bearer is stale and there is no cookie', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(
      app,
      'POST',
      '/api/games/GAME1/end',
      { playerId: 'user_2', result: 'black', reason: 'resignation' },
      { Authorization: 'Bearer stale-prefix' },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired session/i);
  });

  it('still returns 403 when a valid session does not match the player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(
      app,
      'POST',
      '/api/games/GAME1/end',
      { playerId: 'user_99', result: 'black', reason: 'resignation' },
      {
        Authorization: 'Bearer real-session-token',
        Cookie: 'chess_session=real-session-token',
      },
    );

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/identity/i);
  });

  it('returns 401 when no credentials are presented at all', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(
      app,
      'POST',
      '/api/games/GAME1/end',
      { playerId: 'user_2', result: 'black', reason: 'resignation' },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });
});
