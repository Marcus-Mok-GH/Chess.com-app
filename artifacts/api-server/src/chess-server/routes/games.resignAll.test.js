import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (cb) => cb({
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
  })),
}));

vi.mock('../auth.js', () => ({
  getSessionCookieToken: vi.fn((req) => {
    const raw = req.headers?.cookie || '';
    const match = String(raw).match(/(?:^|;\s*)session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }),
  getSessionToken: vi.fn((req) => {
    const auth = req.headers?.authorization || '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    const raw = req.headers?.cookie || '';
    const match = String(raw).match(/(?:^|;\s*)session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }),
  validateSession: vi.fn(),
}));

vi.mock('../services/gameService.js', () => ({
  getGameService: vi.fn(),
}));

vi.mock('../kv/onlineGameKv.js', () => ({
  getOnlineGameKv: vi.fn(),
}));

vi.mock('../kv/drawOfferKv.js', () => ({
  getDrawOfferKv: vi.fn(),
  DRAW_OFFER_STORAGE_ERROR: 'storage-error',
}));

vi.mock('../services/antiCheatService.js', () => ({
  getIntegrityReviews: vi.fn(),
  isIntegrityReviewer: vi.fn(),
  scheduleGameAnalysis: vi.fn(),
  recordIntegrityDecision: vi.fn(),
}));

vi.mock('../services/gameUtils.js', async () => {
  const actual = await vi.importActual('../services/gameUtils.js');
  return {
    ...actual,
  };
});

import { query, withTransaction } from '../db.js';
import { validateSession } from '../auth.js';
import { getGameService } from '../services/gameService.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';

let gameRoutes;

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const data = body == null ? null : JSON.stringify(body);
      const reqHeaders = { ...headers };
      if (data != null) {
        reqHeaders['content-type'] = 'application/json';
        reqHeaders['content-length'] = Buffer.byteLength(data);
      }
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers: reqHeaders },
        (res) => {
          let buf = '';
          res.on('data', (chunk) => { buf += chunk; });
          res.on('end', () => {
            server.close();
            let parsed = null;
            try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
            resolve({ status: res.statusCode, body: parsed });
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (data != null) req.write(data);
      req.end();
    });
  });
}

const mockGameService = { endGame: vi.fn() };
const mockOnlineKv = { del: vi.fn(), get: vi.fn(), set: vi.fn() };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  validateSession.mockReset();
  query.mockReset();
  withTransaction.mockReset();
  withTransaction.mockImplementation(async (cb) => cb({
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
  }));
  mockGameService.endGame.mockReset();
  mockOnlineKv.del.mockReset();
  getGameService.mockReturnValue(mockGameService);
  getOnlineGameKv.mockReturnValue(mockOnlineKv);
  gameRoutes = (await import('./games.js')).default;
});

describe('POST /api/games/resign-all-live', () => {
  it('requires authentication', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/resign-all-live', {});
    expect(res.status).toBe(401);
  });

  it('clears waiting and friendly games that previously blocked matchmaking', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValue('be827321-f624-4051-a300-63c7a52f128e');

    query
      .mockResolvedValueOnce({
        rows: [
          {
            game_id: 'WAIT1',
            status: 'waiting',
            game_mode: 'friendly',
            white_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e_old-tab',
            black_player_id: null,
          },
          {
            game_id: 'PLAY1',
            status: 'playing',
            game_mode: 'friendly',
            white_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e',
            black_player_id: 'user_other',
          },
          {
            game_id: 'RANK1',
            status: 'playing',
            game_mode: 'ranked',
            white_player_id: 'user_other',
            black_player_id: 'user_be827321-f624-4051-a300-63c7a52f128e_tab-b',
          },
        ],
      })
      // WAIT1 abandon
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ game_id: 'WAIT1' }] })
      // PLAY1 end_reason annotate
      .mockResolvedValueOnce({ rowCount: 1 })
      // RANK1 end_reason annotate
      .mockResolvedValueOnce({ rowCount: 1 })
      // matchmaking queue cleanup
      .mockResolvedValueOnce({ rowCount: 0 });

    mockGameService.endGame
      .mockResolvedValueOnce({ game_id: 'PLAY1', status: 'ended', result: 'black' })
      .mockResolvedValueOnce({ game_id: 'RANK1', status: 'ended', result: 'white' });

    const res = await loopback(
      app,
      'POST',
      '/api/games/resign-all-live',
      {},
      { Authorization: 'Bearer valid-token' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      resignedCount: 3,
      gameIds: ['WAIT1', 'PLAY1', 'RANK1'],
    });
    expect(mockGameService.endGame).toHaveBeenCalledWith('PLAY1', 'black');
    expect(mockGameService.endGame).toHaveBeenCalledWith('RANK1', 'white');
    expect(mockOnlineKv.del).toHaveBeenCalledWith('WAIT1');
    expect(mockOnlineKv.del).toHaveBeenCalledWith('PLAY1');
    expect(mockOnlineKv.del).toHaveBeenCalledWith('RANK1');
    expect(String(query.mock.calls.at(-1)[0])).toMatch(/DELETE FROM matchmaking_queue/i);
  });

  it('returns zero when the account has no blocking games', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValue('user-1');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 });

    const res = await loopback(
      app,
      'POST',
      '/api/games/resign-all-live',
      {},
      { Authorization: 'Bearer valid-token' },
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, resignedCount: 0, gameIds: [] });
    expect(mockGameService.endGame).not.toHaveBeenCalled();
  });
});

describe('POST /api/games/online/leave', () => {
  it('ends waiting games when the account matches with a session-suffixed seat id', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const uuid = 'be827321-f624-4051-a300-63c7a52f128e';
    const clientQuery = vi.fn()
      // lockAccounts advisory lock
      .mockResolvedValueOnce({ rows: [] })
      // SELECT game
      .mockResolvedValueOnce({
        rows: [{
          game_id: 'CODE1',
          white_player_id: `user_${uuid}_tab-a`,
          black_player_id: null,
          status: 'waiting',
        }],
      })
      // UPDATE ended
      .mockResolvedValueOnce({ rowCount: 1 });
    withTransaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

    const res = await loopback(app, 'POST', '/api/games/online/leave', {
      gameCode: 'code1',
      playerId: `user_${uuid}_tab-b`,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(String(clientQuery.mock.calls[2][0])).toMatch(/status = 'ended'/i);
    expect(mockOnlineKv.del).toHaveBeenCalledWith('CODE1');
  });

  it('rejects leave attempts from a non-participant', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const clientQuery = vi.fn()
      // lockAccounts
      .mockResolvedValueOnce({ rows: [] })
      // SELECT game owned by someone else
      .mockResolvedValueOnce({
        rows: [{
          game_id: 'CODE1',
          white_player_id: 'user_1',
          black_player_id: null,
          status: 'waiting',
        }],
      });
    withTransaction.mockImplementationOnce(async (cb) => cb({ query: clientQuery }));

    const res = await loopback(app, 'POST', '/api/games/online/leave', {
      gameCode: 'CODE1',
      playerId: 'user_2',
    });

    expect(res.status).toBe(403);
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(mockOnlineKv.del).not.toHaveBeenCalled();
  });
});
