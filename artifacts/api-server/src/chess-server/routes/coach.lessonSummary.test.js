import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({ query: vi.fn() }));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(),
  coachAppRedirect: vi.fn(),
  coachConfigurationStatus: vi.fn(),
  completeAuthorization: vi.fn(),
  createAuthorizationUrl: vi.fn(),
  disconnectCoach: vi.fn(),
  getCoachToken: vi.fn(),
}));

import { authenticatedUserId, getCoachToken } from '../coachAuth.js';

let coachRoutes;
let lastCoachRequest;

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

function post(app, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const payload = JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
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
      req.write(payload);
      req.end();
    });
  });
}

const PUZZLE = {
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  sideToMove: 'white',
  theme: 'Fork',
  tags: ['tactics', 'material'],
  solution: 'Na5',
};

beforeEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  authenticatedUserId.mockResolvedValue(2);
  getCoachToken.mockResolvedValue('sk_coach_token');
  lastCoachRequest = null;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    lastCoachRequest = { url: String(url), body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'White can fork the black king and rook here. Look for a piece that attacks two targets at once.' } }],
      }),
    };
  }));
  await loadRoutes();
});

describe('POST /api/coach/lesson-summary', () => {
  it('builds a puzzle-specific prompt when a generated puzzle is provided', async () => {
    const res = await post(buildApp(), '/api/coach/lesson-summary', {
      title: 'Fork Attack',
      topic: 'Tactics',
      description: ['A fork attacks two pieces at once.'],
      puzzle: PUZZLE,
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('White can fork the black king and rook here. Look for a piece that attacks two targets at once.');

    const prompt = lastCoachRequest.body.messages.find((m) => m.role === 'user').content;
    expect(prompt).toContain(PUZZLE.fen);
    expect(prompt).toContain('Fork');
    expect(prompt).toContain('Na5');
    expect(prompt).toContain('never state the winning move');
  });

  it('falls back to the generic lesson prompt when no puzzle is provided', async () => {
    const res = await post(buildApp(), '/api/coach/lesson-summary', {
      title: 'Fork Attack',
      topic: 'Tactics',
      description: ['A fork attacks two pieces at once.'],
    });

    expect(res.status).toBe(200);
    const prompt = lastCoachRequest.body.messages.find((m) => m.role === 'user').content;
    expect(prompt).toContain('Condense this chess lesson concept');
    expect(prompt).not.toContain(PUZZLE.fen);
  });

  it('ignores a puzzle payload without a FEN and keeps the generic prompt', async () => {
    const res = await post(buildApp(), '/api/coach/lesson-summary', {
      title: 'Fork Attack',
      topic: 'Tactics',
      description: ['A fork attacks two pieces at once.'],
      puzzle: { theme: 'Fork' },
    });

    expect(res.status).toBe(200);
    const prompt = lastCoachRequest.body.messages.find((m) => m.role === 'user').content;
    expect(prompt).toContain('Condense this chess lesson concept');
  });

  it('requires a title and description', async () => {
    const res = await post(buildApp(), '/api/coach/lesson-summary', { title: 'Fork Attack' });

    expect(res.status).toBe(400);
  });

  it('requires an authenticated user', async () => {
    authenticatedUserId.mockResolvedValue(null);

    const res = await post(buildApp(), '/api/coach/lesson-summary', {
      title: 'Fork Attack',
      topic: 'Tactics',
      description: ['A fork attacks two pieces at once.'],
      puzzle: PUZZLE,
    });

    expect(res.status).toBe(401);
  });
});
