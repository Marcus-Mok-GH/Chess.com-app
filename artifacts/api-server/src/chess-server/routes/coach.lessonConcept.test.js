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

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn().mockResolvedValue('user-1'),
  coachAppRedirect: vi.fn(),
  coachConfigurationStatus: vi.fn(),
  completeAuthorization: vi.fn(),
  createAuthorizationUrl: vi.fn(),
  disconnectCoach: vi.fn(),
  getCoachToken: vi.fn().mockResolvedValue('connected-token'),
}));

import { query } from '../db.js';
import { getSessionToken, validateSession } from '../auth.js';
import { authenticatedUserId, getCoachToken } from '../coachAuth.js';

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
      const { port: listenPort } = server.address();
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: '127.0.0.1', port: listenPort, path, method,
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
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  // resetAllMocks clears the factory implementations; re-establish them.
  validateSession.mockResolvedValue('user-1');
  getSessionToken.mockReturnValue('session-token');
  authenticatedUserId.mockResolvedValue('user-1');
  getCoachToken.mockResolvedValue('connected-token');
  query.mockImplementation(async () => ({ rows: [] }));
  await loadRoutes();
});

describe('POST /api/coach/lesson-concept', () => {
  const baseBody = {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    sideToMove: 'black',
    theme: 'Winning the Queen',
    hint: 'A valuable piece is vulnerable.',
    lessonTitle: 'Knight Forks',
    lessonTopic: 'Tactics',
  };

  it('requires login', async () => {
    authenticatedUserId.mockResolvedValue(null);
    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);
    expect(res.status).toBe(401);
  });

  it('requires fen and lessonTitle', async () => {
    const { fen, ...withoutFen } = baseBody;
    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', withoutFen);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fen/i);
  });

  it('returns a concept capped to 22 words from the coach model', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      coachResponse('Black can win material with a forcing tactic against the loose piece on a5.')
    );

    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);

    expect(res.status).toBe(200);
    expect(res.body.concept).toBe(
      'Black can win material with a forcing tactic against the loose piece on a5.'
    );
    // The prompt carries the SPECIFIC position, not the lesson prose.
    const prompt = global.fetch.mock.calls[0][1].body;
    expect(prompt).toContain(baseBody.fen);
    expect(prompt).toContain('Knight Forks');
    expect(prompt).not.toContain('description');
  });

  it('asks the free fallback model when the connected coach fails, still trimming output', async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        // First call (connected model) fails hard so the route falls back.
        return { ok: false, status: 500, text: async () => 'boom' };
      }
      return coachResponse(
        'White is down a rook and must find a check. The back rank is weak because the king has no escape squares and the pawns do not help at all.'
      );
    });

    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);

    expect(res.status).toBe(200);
    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(res.body.concept.split(' ').length).toBeLessThanOrEqual(22);
    expect(res.body.concept).toMatch(/White is down a rook/);
  });

  it('surfaces 402 as POLLINATIONS_AUTH_REQUIRED when both models refuse', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'payment required' });

    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('POLLINATIONS_AUTH_REQUIRED');
  });
});
