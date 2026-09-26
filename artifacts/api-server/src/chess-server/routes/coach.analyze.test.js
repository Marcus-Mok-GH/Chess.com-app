import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  getSessionToken: vi.fn(() => 'session-token'),
  validateSession: vi.fn().mockResolvedValue('user-1'),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionCookieToken: vi.fn(() => null),
}));

import { query } from '../db.js';
import { getSessionToken, validateSession } from '../auth.js';

let coachRoutes;

async function loadRoutes() {
  const module = await import('./coach.js');
  coachRoutes = module.default;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/coach', coachRoutes);
  return app;
}

function loopback(app, path, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: '127.0.0.1', port, path, method,
          headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        },
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
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function coachResponse(content) {
  return { choices: [{ message: { content } }] };
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  // resetAllMocks clears the factory implementations; re-establish them.
  validateSession.mockResolvedValue('user-1');
  getSessionToken.mockReturnValue('session-token');
  // The user has a connected Pollinations token.
  query.mockImplementation(async (sql) => {
    if (/pollinations_coach_tokens/.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  await loadRoutes();
});

describe('POST /api/coach/analyze', () => {
  it('repairs a truncated JSON array so partial coach comments still load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => coachResponse(
        '[{"ply":1,"moveNumber":1,"color":"white","san":"e4","review":"Strong start."},{"ply":2,"moveNumber":1,"color":"black","san":"e5","review":"Classical repl'
      ),
    });
    const res = await loopback(buildApp(), '/api/coach/analyze', 'POST', {
      moveHistory: [{ san: 'e4' }, { san: 'e5' }],
      result: 'white',
    });
    expect(res.status).toBe(200);
    expect(res.body.analysis.format).toBe('move_review');
    expect(res.body.analysis.moves).toHaveLength(1);
    expect(res.body.analysis.moves[0].review).toBe('Strong start.');
  });

  it('chunks long games and merges the reviews', async () => {
    const moveHistory = Array.from({ length: 25 }, (_, i) => ({ san: i === 0 ? 'e4' : 'c5' }));
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => {
        const calls = global.fetch.mock.calls.length;
        // Chunk 1 covers plies 1-20, chunk 2 covers 21-25.
        const startPly = calls === 1 ? 1 : 21;
        const endPly = calls === 1 ? 20 : 25;
        const moves = [];
        for (let ply = startPly; ply <= endPly; ply += 1) {
          moves.push({ ply, moveNumber: Math.floor((ply - 1) / 2) + 1, color: ply % 2 === 1 ? 'white' : 'black', san: ply === 1 ? 'e4' : 'c5', review: `Move ${ply} reviewed.` });
        }
        return coachResponse(JSON.stringify(moves));
      },
    }));
    const res = await loopback(buildApp(), '/api/coach/analyze', 'POST', {
      moveHistory,
      result: 'white',
    });
    expect(res.status).toBe(200);
    expect(global.fetch.mock.calls.length).toBe(2);
    expect(res.body.analysis.moves).toHaveLength(25);
    expect(res.body.analysis.moves[24].review).toBe('Move 25 reviewed.');
  });

  it('strips closed thinking blocks before parsing reviews', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => coachResponse(
        '\n[{"ply":1,"moveNumber":1,"color":"white","san":"e4","review":"Strong classical start."}]'
      ),
    });
    const res = await loopback(buildApp(), '/api/coach/analyze', 'POST', {
      moveHistory: [{ san: 'e4' }],
      result: 'white',
    });
    expect(res.status).toBe(200);
    expect(res.body.analysis.moves[0].review).toBe('Strong classical start.');
  });

  it('strips unclosed thinking traces so reasoning never reaches the player', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => coachResponse(
        '<thinking>The student played e4 and the best reply is e5, let me think longer about every option. Black to move, center is unstable,'
      ),
    });
    const res = await loopback(buildApp(), '/api/coach/analyze', 'POST', {
      moveHistory: [{ san: 'e4' }],
      result: 'white',
    });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toBe('');
  });

  it('falls back to the raw content when nothing can be parsed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => coachResponse('The game was too short to review.'),
    });
    const res = await loopback(buildApp(), '/api/coach/analyze', 'POST', {
      moveHistory: [{ san: 'e4' }],
      result: 'white',
    });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toBe('The game was too short to review.');
  });
});
