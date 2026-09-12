import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  validateSession: vi.fn().mockResolvedValue(2),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionToken: vi.fn(() => 'test-token'),
}));

vi.mock('../services/gameUtils.js', () => ({
  userIdFromPlayerId: (pid) => {
    if (!pid || typeof pid !== 'string') return null;
    const m = pid.match(/^user_(\d+)/);
    return m ? Number(m[1]) : null;
  },
  hasValidEloPair: () => true,
}));

vi.mock('../kv/onlineGameKv.js', () => ({
  getOnlineGameKv: vi.fn(),
}));

vi.mock('../kv/drawOfferKv.js', () => ({
  getDrawOfferKv: vi.fn(),
  DRAW_OFFER_STORAGE_ERROR: Symbol('DRAW_OFFER_STORAGE_ERROR'),
}));

vi.mock('../services/gameService.js', () => ({
  getGameService: vi.fn(),
}));

const START_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

import { query } from '../db.js';
import { validateSession } from '../auth.js';
import { getDrawOfferKv, DRAW_OFFER_STORAGE_ERROR } from '../kv/drawOfferKv.js';
import { getGameService } from '../services/gameService.js';

let gameRoutes;
let mockOfferKv;
let mockGameService;

function mockActiveGame(overrides = {}) {
  return {
    game_id: 'GAME1',
    status: 'playing',
    fen: START_FEN,
    move_history: [{ san: 'e4', from: 'e2', to: 'e4' }],
    move_count: 1,
    white_player_id: 'user_1',
    black_player_id: 'user_2',
    white_socket_id: 'ws-1',
    black_socket_id: 'ws-2',
    white_player_name: 'Alice',
    black_player_name: 'Bob',
    white_elo: 1200,
    black_elo: 1400,
    game_mode: 'ranked',
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

function loopback(app, method, path, body, headers = { Authorization: 'Bearer test-token' }) {
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
  validateSession.mockResolvedValue(2);
  mockOfferKv = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    createIfAbsent: vi.fn().mockResolvedValue(null),
    consumeIfMatches: vi.fn().mockResolvedValue({ offeredBy: 'user_2', createdAt: new Date().toISOString() }),
  };
  getDrawOfferKv.mockReturnValue(mockOfferKv);
  mockGameService = {
    endGame: vi.fn(),
  };
  getGameService.mockReturnValue(mockGameService);
  gameRoutes = (await import('./games.js')).default;
});

describe('POST /api/games/:gameId/draw-offer', () => {
  it('returns 400 for a missing player ID', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/player/i);
  });

  it('returns 403 when the session identity does not match the player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_99' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/identity/i);
  });

  it('returns 404 when the game is not found', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_2' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when the requester is not seated in the game', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    validateSession.mockResolvedValue(9);
    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_9' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/your game|not your game/i);
  });

  it('returns 409 when a draw offer already exists', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.createIfAbsent.mockResolvedValueOnce({
      offeredBy: 'user_1',
      createdAt: new Date().toISOString(),
    });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_2' });
    expect(res.status).toBe(409);
  });

  it('reports 503 when the offer cannot be stored', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.createIfAbsent.mockResolvedValueOnce(DRAW_OFFER_STORAGE_ERROR);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_2' });
    expect(res.status).toBe(503);
  });

  it('stores a draw offer and returns the offering player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-offer', { playerId: 'user_2' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, offeredBy: 'user_2' });
    expect(mockOfferKv.createIfAbsent).toHaveBeenCalledWith(
      'GAME1',
      expect.objectContaining({ offeredBy: 'user_2', createdAt: expect.any(String) })
    );
  });
});

describe('GET /api/games/:gameId/draw-offer', () => {
  it('returns 401 without a valid session', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValueOnce(null);

    const res = await loopback(app, 'GET', '/api/games/GAME1/draw-offer', undefined, {});
    expect(res.status).toBe(401);
  });

  it('returns the current offer', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_1', createdAt: '2026-01-01T00:00:00Z' });

    const res = await loopback(app, 'GET', '/api/games/GAME1/draw-offer');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      offer: { offeredBy: 'user_1', createdAt: '2026-01-01T00:00:00Z' },
    });
  });

  it('returns 403 when the requester is not a participant', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    validateSession.mockResolvedValue(9);

    const res = await loopback(app, 'GET', '/api/games/GAME1/draw-offer');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/your game|not your game/i);
  });

  it('returns 404 when the game is not active', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame({ status: 'ended' })] });

    const res = await loopback(app, 'GET', '/api/games/GAME1/draw-offer');
    expect(res.status).toBe(404);
  });

  it('returns null when no offer exists', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'GET', '/api/games/GAME1/draw-offer');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, offer: null });
  });
});

describe('POST /api/games/:gameId/draw-respond', () => {
  it('returns 400 for a missing player ID', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { accept: true });
    expect(res.status).toBe(400);
  });

  it('returns 400 when accept is not a boolean', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_1', accept: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/i);
  });

  it('returns 403 when the session identity does not match the player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_99', accept: true });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the game is not found', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_2', accept: true });
    expect(res.status).toBe(404);
  });

  it('returns 409 when there is no active offer', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_2', accept: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/offer/i);
  });

  it('returns 409 when a player responds to their own offer', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });

    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_2', accept: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/opponent|offer/i);
  });

  it('accepts the offer, ends the game as a draw, and clears the offer', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });
    mockGameService.endGame.mockResolvedValueOnce({ game_id: 'GAME1', status: 'ended', result: 'draw' });

    validateSession.mockResolvedValue(1);
    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_1', accept: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'draw' });
    expect(mockGameService.endGame).toHaveBeenCalledWith('GAME1', 'draw');
    expect(mockOfferKv.del).toHaveBeenCalledWith('GAME1');
    expect(mockGameService.endGame.mock.invocationCallOrder[0])
      .toBeLessThan(mockOfferKv.del.mock.invocationCallOrder[0]);
  });

  it('does not clear the offer when accepting fails because the game already ended', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });
    mockGameService.endGame.mockResolvedValueOnce(null);

    validateSession.mockResolvedValue(1);
    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_1', accept: true });

    expect(res.status).toBe(409);
    expect(mockOfferKv.del).not.toHaveBeenCalled();
  });

  it('declines the offer and clears it without ending the game', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });
    mockOfferKv.consumeIfMatches.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });

    validateSession.mockResolvedValue(1);
    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_1', accept: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'declined' });
    expect(mockGameService.endGame).not.toHaveBeenCalled();
    expect(mockOfferKv.consumeIfMatches).toHaveBeenCalledWith('GAME1', 'user_2');
    expect(mockOfferKv.del).not.toHaveBeenCalled();
  });

  it('returns 409 when the offer was already consumed by a concurrent reply', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    mockOfferKv.get.mockResolvedValueOnce({ offeredBy: 'user_2', createdAt: new Date().toISOString() });
    mockOfferKv.consumeIfMatches.mockResolvedValueOnce(null);

    validateSession.mockResolvedValue(1);
    const res = await loopback(app, 'POST', '/api/games/GAME1/draw-respond', { playerId: 'user_1', accept: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/offer/i);
  });
});