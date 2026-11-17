import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
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


// The coach needs a connected Pollinations account now that the free fallback
// is gone, so give the route a decryptable stored token.
const TEST_ENCRYPTION_KEY = 'coach-test-key';
function encryptedToken(token) {
  const key = crypto.createHash('sha256').update(TEST_ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}
function coachTokenRow() {
  return { rows: [{ encrypted_token: encryptedToken('sk_test'), expires_at: new Date(Date.now() + 86400000) }] };
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
  process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  query.mockImplementation(async (sql) => {
    if (/FROM pollinations_coach_tokens/.test(sql)) return coachTokenRow();
    return { rows: [] };
  });
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
    validateSession.mockResolvedValue(null);
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

  it('uses one model only and surfaces a failure instead of switching models', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);

    expect(res.status).toBe(500);
    const models = new Set(global.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).model));
    expect(models.size).toBe(1);
  });

  it('surfaces 402 as POLLINATIONS_AUTH_REQUIRED when the model refuses', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'payment required' });

    const res = await loopback(buildApp(), '/api/coach/lesson-concept', 'POST', baseBody);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('POLLINATIONS_AUTH_REQUIRED');
  });
});
