import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  getSessionCookieToken: vi.fn(() => null),
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

vi.mock('../services/antiCheatService.js', () => ({
  getIntegrityReviews: vi.fn(),
  isIntegrityReviewer: vi.fn(() => false),
  scheduleGameAnalysis: vi.fn(),
  recordIntegrityDecision: vi.fn(),
}));

const WHITE_TO_MOVE_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RAPID_MS = 10 * 60 * 1000;

import { query } from '../db.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';

let gameRoutes;
let mockKv;

function rapidGame(overrides = {}) {
  return {
    game_id: 'GAME1',
    status: 'playing',
    fen: WHITE_TO_MOVE_FEN,
    move_history: [],
    move_count: 0,
    white_player_id: 'user_1',
    black_player_id: 'user_2',
    white_player_name: 'Alice',
    black_player_name: 'Bob',
    white_elo: 1200,
    black_elo: 1400,
    game_mode: 'ranked',
    time_control: 'rapid',
    white_time_ms: RAPID_MS,
    black_time_ms: RAPID_MS,
    clock_running_since: new Date(),
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

/**
 * Makes the next request authenticate as `uid` — the routes compare the
 * session's user id against the seat's user id.
 */
async function actAs(uid) {
  const { validateSession } = await import('../auth.js');
  validateSession.mockResolvedValueOnce(uid);
}

/** Finds the UPDATE that ran against active_games. */
function activeGameUpdate() {
  return query.mock.calls.find((c) => {
    const sql = String(c[0] || '');
    return sql.includes('UPDATE active_games');
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  const { validateSession } = await import('../auth.js');
  validateSession.mockResolvedValue(2);
  mockKv = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };
  getOnlineGameKv.mockReturnValue(mockKv);
  gameRoutes = (await import('./games.js')).default;
});

describe('POST /api/games/:gameId/move with a rapid clock', () => {
  it('deducts the elapsed time from the mover and hands over the clock', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);

    // White is on move and has used 30 seconds.
    query
      .mockResolvedValueOnce({
        rows: [rapidGame({ clock_running_since: new Date(Date.now() - 30_000) })],
      })
      .mockResolvedValueOnce({ rows: [{ status: 'playing' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move', {
      move: { from: 'e2', to: 'e4' },
      playerId: 'user_1',
      expectedMoveCount: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const update = activeGameUpdate();
    expect(update).toBeTruthy();
    const [, params] = update;
    const whiteMs = params[4];
    const blackMs = params[5];
    // ~30s was consumed (allow scheduling slack), Black is untouched.
    expect(whiteMs).toBeLessThanOrEqual(RAPID_MS - 29_000);
    expect(whiteMs).toBeGreaterThan(RAPID_MS - 32_000);
    expect(blackMs).toBe(RAPID_MS);
  });

  it('credits the 10+3 increment to the mover inside the same update', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);

    // White has used ~5 seconds on a 10+3 clock.
    query
      .mockResolvedValueOnce({
        rows: [
          rapidGame({
            time_control: 'rapid_10_3',
            clock_running_since: new Date(Date.now() - 5_000),
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ status: 'playing' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move', {
      move: { from: 'e2', to: 'e4' },
      playerId: 'user_1',
      expectedMoveCount: 0,
    });

    expect(res.status).toBe(200);
    const [, params] = activeGameUpdate();
    const whiteMs = params[4];
    const blackMs = params[5];
    // ~5s consumed, then the 3s Fischer increment is added back to White.
    expect(whiteMs).toBeLessThanOrEqual(RAPID_MS - 5_000 + 3_000);
    expect(whiteMs).toBeGreaterThan(RAPID_MS - 5_000 + 3_000 - 2_000);
    expect(blackMs).toBe(RAPID_MS);
  });

  it('ends the game with the opponent winning when the mover has flagged', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);

    const expired = rapidGame({
      clock_running_since: new Date(Date.now() - (RAPID_MS + 5_000)),
    });
    // finishGameOnTimeout runs the full terminal transition via gameService,
    // so the mock dispatches on SQL instead of counting calls.
    query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("SET status = 'ended'")) {
        return { rows: [{ ...expired, status: 'ended', result: 'black' }] };
      }
      if (s.includes('SELECT * FROM active_games')) return { rows: [expired] };
      return { rows: [] };
    });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move', {
      move: { from: 'e2', to: 'e4' },
      playerId: 'user_1',
      expectedMoveCount: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body.timedOut).toBe(true);
    expect(res.body.result).toBe('black');
    expect(res.body.endReason).toBe('timeout');

    // The flagged side loses and the move is never applied to the board.
    const terminal = activeGameUpdate();
    expect(String(terminal[0])).toContain("status = 'ended'");
    expect(terminal[1]).toEqual(['GAME1', 'black']);
    // Ranked timeout still rates both players.
    expect(mockKv.set).not.toHaveBeenCalled();
    expect(mockKv.del).toHaveBeenCalledWith('GAME1');
    const eloCalls = query.mock.calls.filter((c) =>
      String(c[0]).includes('UPDATE users'),
    );
    expect(eloCalls).toHaveLength(2);
  });

  it('does not touch the clock for untimed games', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);

    query
      .mockResolvedValueOnce({
        rows: [
          rapidGame({
            time_control: 'unlimited',
            white_time_ms: null,
            black_time_ms: null,
            clock_running_since: null,
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ status: 'playing' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move', {
      move: { from: 'e2', to: 'e4' },
      playerId: 'user_1',
      expectedMoveCount: 0,
    });

    expect(res.status).toBe(200);
    const update = activeGameUpdate();
    expect(update[1][4]).toBeNull();
    expect(update[1][5]).toBeNull();
  });
});

describe('GET /api/games/by-code/:gameCode with a rapid clock', () => {
  it('exposes live remaining time and the side on the clock', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    query.mockResolvedValueOnce({
      rows: [
        {
          game_code: 'GAME1',
          status: 'playing',
          fen: WHITE_TO_MOVE_FEN,
          move_history: [],
          move_count: 0,
          game_mode: 'ranked',
          time_control: 'rapid',
          white_time_ms: RAPID_MS - 20_000,
          black_time_ms: RAPID_MS,
          clock_running_since: new Date(Date.now() - 1_000),
        },
      ],
    });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1', undefined, {});

    expect(res.status).toBe(200);
    expect(res.body.time_control).toBe('rapid');
    expect(res.body.clock_side).toBe('white');
    expect(res.body.white_time_ms).toBeLessThanOrEqual(RAPID_MS - 20_000);
    expect(res.body.black_time_ms).toBe(RAPID_MS);
  });

  it('finalises a timed-out game on read, even with no move in flight', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const live = {
      game_code: 'GAME1',
      status: 'playing',
      fen: WHITE_TO_MOVE_FEN,
      move_history: [],
      move_count: 0,
      game_mode: 'ranked',
      time_control: 'rapid',
      white_time_ms: 0,
      black_time_ms: RAPID_MS,
      clock_running_since: new Date(Date.now() - RAPID_MS - 1_000),
      white_player_id: 'user_1',
      black_player_id: 'user_2',
    };
    const ended = {
      ...live,
      status: 'ended',
      result: 'black',
      end_reason: 'timeout',
      clock_running_since: null,
    };
    let settled = false;

    query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("SET status = 'ended'")) {
        settled = true;
        return { rows: [{ ...live, status: 'ended', result: 'black' }] };
      }
      if (s.includes('SELECT game_id AS game_code')) {
        return { rows: [settled ? ended : live] };
      }
      return { rows: [] };
    });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1', undefined, {});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ended');
    expect(res.body.result).toBe('black');
    expect(res.body.end_reason).toBe('timeout');
    expect(mockKv.del).toHaveBeenCalledWith('GAME1');
  });
});

describe('POST /api/games/:gameId/end with reason=timeout', () => {
  it('rejects a timeout claim while the clock is still running', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);
    query.mockResolvedValueOnce({ rows: [rapidGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/end', {
      result: 'black',
      reason: 'timeout',
      playerId: 'user_1',
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/timeout/i);
  });

  it('accepts a genuine flag fall and records the reason', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    await actAs(1);

    query
      .mockResolvedValueOnce({
        rows: [
          rapidGame({
            clock_running_since: new Date(Date.now() - (RAPID_MS + 1_000)),
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          rapidGame({
            status: 'ended',
            result: 'black',
            end_reason: 'timeout',
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/end', {
      result: 'black',
      reason: 'timeout',
      playerId: 'user_1',
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('black');
    const update = activeGameUpdate();
    expect(String(update[0])).toContain('end_reason = $3');
    expect(update[1]).toEqual(['GAME1', 'black', 'timeout']);
  });
});
