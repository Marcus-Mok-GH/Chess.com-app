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
  getSessionToken: vi.fn(() => null),
}));

import { query } from '../db.js';

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

function loopback(app, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, path, method: 'GET', headers },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => server.close(() => {
            let parsed;
            try { parsed = JSON.parse(buf); } catch { parsed = buf; }
            resolve({ status: res.statusCode, body: parsed, location: res.headers.location });
          }));
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      req.end();
    });
  });
}

const PROXY_HEADERS = {
  Host: 'chess-com-app.vercel.app',
  'x-forwarded-host': 'chess-com-app.vercel.app',
  'x-forwarded-proto': 'https',
};

beforeEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  delete process.env.APP_URL;
  process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
  process.env.POLLINATIONS_CLIENT_ID = 'pk_test_client';
  await loadRoutes();
});

describe('GET /api/coach/callback', () => {
  it('redirects back to the app origin derived from the request when APP_URL is unset', async () => {
    const res = await loopback(buildApp(), '/api/coach/callback', PROXY_HEADERS);

    expect(res.status).toBe(302);
    expect(res.location).toBe('https://chess-com-app.vercel.app/play?coach_error=authorization_incomplete');
  });

  it('prefers a valid APP_URL over the request-derived origin', async () => {
    process.env.APP_URL = 'https://configured.example.com';
    await loadRoutes();

    const res = await loopback(buildApp(), '/api/coach/callback', PROXY_HEADERS);

    expect(res.status).toBe(302);
    expect(res.location).toBe('https://configured.example.com/play?coach_error=authorization_incomplete');
  });

  it('falls back to the request origin when APP_URL is malformed', async () => {
    process.env.APP_URL = 'not a url';
    await loadRoutes();

    const res = await loopback(buildApp(), '/api/coach/callback', PROXY_HEADERS);

    expect(res.status).toBe(302);
    expect(res.location).toBe('https://chess-com-app.vercel.app/play?coach_error=authorization_incomplete');
  });

  it('redirects with the failure reason when the OAuth state is invalid', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await loopback(buildApp(), '/api/coach/callback?code=abc&state=stale', PROXY_HEADERS);

    expect(res.status).toBe(302);
    expect(res.location).toContain('coach_error=');
    expect(decodeURIComponent(res.location)).toContain('Pollinations authorization state is invalid');
  });

  it('stores the exchanged token and redirects with coach_connected', async () => {
    const discovery = {
      authorization_endpoint: 'https://enter.pollinations.ai/authorize',
      token_endpoint: 'https://enter.pollinations.ai/api/oauth/token',
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('.well-known/oauth-authorization-server')) {
        return { ok: true, json: async () => discovery };
      }
      return { ok: true, json: async () => ({ access_token: 'sk_test_token', expires_in: 3600, scope: 'profile usage' }) };
    }));
    query
      .mockResolvedValueOnce({
        rows: [{ user_id: 2, code_verifier: 'verifier', redirect_uri: 'https://chess-com-app.vercel.app/api/coach/callback' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await loopback(buildApp(), '/api/coach/callback?code=abc&state=valid', PROXY_HEADERS);

    expect(res.status).toBe(302);
    expect(res.location).toBe('https://chess-com-app.vercel.app/play?coach_connected=1');
    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO pollinations_coach_tokens'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][0]).toBe(2);
    expect(insertCall[1][1]).not.toBe('sk_test_token'); // stored encrypted, not plaintext
  });

  it('returns a helpful JSON error instead of an unhandled 500 when no origin exists at all', async () => {
    const res = await loopback(buildApp(), '/api/coach/callback', { Host: '' });

    expect([302, 500]).toContain(res.status);
    if (res.status === 500) {
      expect(res.body.error.message).toMatch(/APP_URL|coach/i);
    }
  });
});
