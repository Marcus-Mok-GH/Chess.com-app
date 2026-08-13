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
}));

vi.mock('../socket/utils.js', () => ({
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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

import { query } from '../db.js';
import { validateSession } from '../auth.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';

let gameRoutes;
let mockKv;

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
  mockKv = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };
  getOnlineGameKv.mockReturnValue(mockKv);
  gameRoutes = (await import('./games.js')).default;
});

describe('POST /api/games/:gameId/move', () => {
  it('returns 400 for missing player ID', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, expectedMoveCount: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/player/i);
  });

  it('returns 400 for invalid move payload', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: null, playerId: 'user_2', expectedMoveCount: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/move/i);
  });

  it('returns 400 for missing expectedMoveCount', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when game not found', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found|not active/i);
  });

  it('returns 404 when game not active', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame({ status: 'ended' })] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });
    expect(res.status).toBe(404);
  });

  it('returns 403 for unauthorized player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_99', expectedMoveCount: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/identity|unauthorized/i);
  });

  it('returns 409 when not your turn', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValueOnce(1);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e2', to: 'e4' }, playerId: 'user_1', expectedMoveCount: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/turn/i);
  });

  it('returns 409 when expectedMoveCount is stale', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 0 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stale/i);
  });

  it('returns 422 for illegal move (wrong piece)', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e4', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/illegal/i);
  });

  it('accepts valid e7-e5 and CAS-updates atomically', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const updatedGame = {
      ...mockActiveGame(),
      move_count: 2,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      move_history: [
        { san: 'e4', from: 'e2', to: 'e4' },
        { san: 'e5', from: 'e7', to: 'e5' },
      ],
    };
    query
      .mockResolvedValueOnce({ rows: [mockActiveGame()] })
      .mockResolvedValueOnce({ rows: [updatedGame], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.moveCount).toBe(2);
    expect(res.body.fen).toContain('w KQkq');
  });

  it('returns 409 when CAS fails (concurrent modification)', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [mockActiveGame()] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stale|concurrent/i);
  });

  it('requires a Bearer token', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 }, {});

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });

  it('rejects an invalid Bearer token', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValueOnce(null);

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('validates the Bearer token', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(validateSession).toHaveBeenCalledWith('test-token');
  });

  it('rejects move when Bearer token identity mismatches player', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    validateSession.mockResolvedValueOnce(99);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 },
      { 'Authorization': 'Bearer wrong-token' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/session.*identity|mismatch/i);
  });
});


describe('POST /api/games/:gameId/end', () => {
  it('rejects an agreed draw through the automatic terminal endpoint', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const res = await loopback(app, 'POST', '/api/games/GAME1/end',
      { playerId: 'user_2', result: 'draw', reason: 'agreement' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/socket draw flow|draw agreement/i);
  });

  it('rejects a false checkmate result', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });
    const res = await loopback(app, 'POST', '/api/games/GAME1/end',
      { playerId: 'user_2', result: 'black', reason: 'checkmate' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/checkmate/i);
  });
});

describe('GET /api/games/history/:username', () => {
  it('matches completed games by the authenticated user ID as well as username', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const games = [{
      game_code: 'GAME1', result: 'white', move_history: ['e4'], game_mode: 'ranked',
    }];
    query.mockResolvedValueOnce({ rows: games });

    const res = await loopback(app, 'GET', '/api/games/history/550e8400-e29b-41d4-a716-446655440000');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(games);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('white_player_id = $1');
    expect(sql).toContain('black_player_id = $1');
    expect(sql).toContain('LOWER(username) = LOWER($1)');
  });
});

describe('GET /api/games/by-code/:gameCode — active_games checked first', () => {
  it('returns active_games row even when a stale games row exists', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const activeGame = {
      game_id: 'GAME1', fen: 'active-fen', move_history: ['e4'],
      game_mode: 'ranked', status: 'playing', created_at: new Date(),
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob',
      white_elo: 1200, black_elo: 1400, move_count: 1,
    };
    query.mockResolvedValueOnce({ rows: [activeGame] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.fen).toBe('active-fen');
    expect(res.body.status).toBe('playing');
  });

  it('falls back to games table when active_games has no row', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const completedGame = {
      game_code: 'GAME1', result: 'white', fen: 'final-fen',
      move_history: ['e4', 'e5'], game_mode: 'friendly', status: 'completed',
      created_at: new Date(),
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob',
    };
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [completedGame] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.fen).toBe('final-fen');
  });
});

describe('POST /api/games/:gameId/move — KV write-through', () => {
  it('invokes kv.set with move_count 2 after accepted move', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const updatedGame = {
      ...mockActiveGame(),
      move_count: 2,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      move_history: [
        { san: 'e4', from: 'e2', to: 'e4' },
        { san: 'e5', from: 'e7', to: 'e5' },
      ],
    };
    query
      .mockResolvedValueOnce({ rows: [mockActiveGame()] })
      .mockResolvedValueOnce({ rows: [updatedGame], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.moveCount).toBe(2);
    expect(mockKv.set).toHaveBeenCalledWith('GAME1', expect.objectContaining({ move_count: 2 }));
  });

  it('does not invoke kv.set for illegal move', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query.mockResolvedValueOnce({ rows: [mockActiveGame()] });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e4', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(422);
    expect(mockKv.set).not.toHaveBeenCalled();
  });

  it('does not invoke kv.set when CAS fails (concurrent modification)', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [mockActiveGame()] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await loopback(app, 'POST', '/api/games/GAME1/move',
      { move: { from: 'e7', to: 'e5' }, playerId: 'user_2', expectedMoveCount: 1 });

    expect(res.status).toBe(409);
    expect(mockKv.set).not.toHaveBeenCalled();
  });
});

describe('GET /api/games/by-code/:gameCode — KV comparison', () => {
  it('returns DB and repopulates KV when DB has newer move_count', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const kvState = {
      game_id: 'GAME1', game_code: 'GAME1', fen: START_FEN,
      move_history: [{ san: 'e4' }], move_count: 1, status: 'playing',
      game_mode: 'ranked', white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    const dbRow = {
      game_code: 'GAME1', fen: 'newer-fen', move_history: ['e4', 'd5'],
      move_count: 3, status: 'playing', game_mode: 'ranked',
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    mockKv.get.mockResolvedValue(kvState);
    query.mockResolvedValueOnce({ rows: [dbRow] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.move_count).toBe(3);
    expect(res.body.fen).toBe('newer-fen');
    expect(mockKv.set).toHaveBeenCalledWith('GAME1', dbRow);
  });

  it('returns KV without setting when KV is current', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const kvState = {
      game_id: 'GAME1', game_code: 'GAME1', fen: START_FEN,
      move_history: ['e4', 'd5'], move_count: 3, status: 'playing',
      game_mode: 'ranked', white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    const dbRow = {
      game_code: 'GAME1', fen: 'older-fen', move_history: ['e4'],
      move_count: 3, status: 'playing', game_mode: 'ranked',
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    mockKv.get.mockResolvedValue(kvState);
    query.mockResolvedValueOnce({ rows: [dbRow] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.fen).toBe(START_FEN);
    expect(res.body.move_count).toBe(3);
    expect(mockKv.set).not.toHaveBeenCalled();
  });

  it('returns DB and sets KV when KV is missing', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const dbRow = {
      game_code: 'GAME1', fen: START_FEN, move_history: ['e4'],
      move_count: 1, status: 'playing', game_mode: 'ranked',
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    mockKv.get.mockResolvedValue(null);
    query.mockResolvedValueOnce({ rows: [dbRow] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.fen).toBe(START_FEN);
    expect(mockKv.set).toHaveBeenCalledWith('GAME1', dbRow);
  });

  it('returns KV when active_games query fails', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const kvState = {
      game_id: 'GAME1', game_code: 'GAME1', fen: START_FEN,
      move_history: [], move_count: 5, status: 'playing',
      game_mode: 'ranked', white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    mockKv.get.mockResolvedValue(kvState);
    query.mockRejectedValueOnce(new Error('connection refused'));

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.move_count).toBe(5);
  });

  it('prefers completed games table row over stale non-playing KV', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const kvState = {
      game_id: 'GAME1', game_code: 'GAME1', fen: 'old-fen',
      move_history: [], move_count: 5, status: 'completed',
      game_mode: 'ranked', white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    const completedRow = {
      game_code: 'GAME1', result: 'white', fen: 'final-fen',
      move_history: ['e4', 'e5', 'd4'], game_mode: 'ranked', status: 'completed',
      created_at: new Date(),
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob',
    };
    mockKv.get.mockResolvedValue(kvState);
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [completedRow] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.fen).toBe('final-fen');
  });

  it('prefers DB when statuses differ even if KV has higher move_count', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    const kvState = {
      game_id: 'GAME1', game_code: 'GAME1', fen: START_FEN,
      move_history: [], move_count: 5, status: 'playing',
      game_mode: 'ranked', white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    const dbRow = {
      game_code: 'GAME1', fen: 'ended-fen', move_history: ['e4', 'e5'],
      move_count: 3, status: 'ended', game_mode: 'ranked',
      white_player_id: 'user_1', black_player_id: 'user_2',
      white_player_name: 'Alice', black_player_name: 'Bob', white_elo: 1200, black_elo: 1400,
    };
    mockKv.get.mockResolvedValue(kvState);
    query.mockResolvedValueOnce({ rows: [dbRow] });

    const res = await loopback(app, 'GET', '/api/games/by-code/GAME1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ended');
    expect(mockKv.set).toHaveBeenCalledWith('GAME1', dbRow);
  });
});


describe('authenticated local game persistence', () => {
  function localSavePayload(overrides = {}) {
    return {
      gameCode: 'LOCAL1',
      gameMode: 'local',
      userId: 2,
      username: 'Untrusted Client Name',
      result: 'black',
      moveHistory: [],
      opponentName: 'Nelson',
      opponentElo: 1300,
      playerColor: 'white',
      finalFen: START_FEN,
      ...overrides,
    };
  }

  it('requires a valid session before saving a local game', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/save', localSavePayload(), {});

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a local-game save when the requested user differs from the session user', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/save', localSavePayload({ userId: 99 }));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/identity/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the authenticated account identity and does not rate a local result', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [{ username: 'AuthenticatedPlayer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 17, game_code: 'LOCAL1' }] });

    const res = await loopback(app, 'POST', '/api/games/save', localSavePayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, gameId: 17, gameCode: 'LOCAL1' });
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'LOCAL1', 2, null, 'AuthenticatedPlayer', 'Nelson', 'black', 'local', START_FEN,
    ]));
    expect(query.mock.calls.some(([sql]) => /elo_history|UPDATE users\s+SET elo/i.test(sql))).toBe(false);
  });

  it('does not overwrite an existing game that belongs to another account', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [{ username: 'AuthenticatedPlayer' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/save', localSavePayload());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/another player/i);
  });

  it('rejects non-local game modes from the local archive endpoint', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);

    const res = await loopback(app, 'POST', '/api/games/save', localSavePayload({ gameMode: 'ranked' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/local games/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('binds local game creation to the authenticated account identity', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [{ username: 'AuthenticatedPlayer' }] })
      .mockResolvedValueOnce({ rows: [{ game_code: 'LOCAL2' }] });

    const res = await loopback(app, 'POST', '/api/games/local/create', {
      gameCode: 'LOCAL2',
      userId: 2,
      username: 'Untrusted Client Name',
      opponentName: 'Nelson',
      playerColor: 'black',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, gameCode: 'LOCAL2' });
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'LOCAL2', null, 2, 'Nelson', 'AuthenticatedPlayer', 'in_progress', 'local',
    ]));
  });

  it('does not overwrite another account when creating a local game with a reused code', async () => {
    const app = buildApp();
    app.use('/api/games', gameRoutes);
    query
      .mockResolvedValueOnce({ rows: [{ username: 'AuthenticatedPlayer' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(app, 'POST', '/api/games/local/create', {
      gameCode: 'LOCAL2',
      userId: 2,
      opponentName: 'Nelson',
      playerColor: 'black',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/another player/i);
  });
});
