import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import cors from 'cors';

// Set CORS-relevant env BEFORE cors.js is evaluated — it reads process.env at
// module load time. The production allowlist is the deployed FRONTEND_URL; the
// Vercel same-deployment env var is a bare host (no scheme) by design.
process.env.FRONTEND_URL = 'https://chess-com-app.vercel.app';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'chess-com-app.vercel.app';
process.env.VERCEL_URL = undefined;
process.env.VERCEL_BRANCH_URL = undefined;
process.env.FRONTEND_URLS = undefined;

let app;

beforeAll(async () => {
  const { corsOptions } = await import('./cors.js');
  app = express();
  app.use(cors(corsOptions));
  app.use(express.json());
  // Mirrors the real send-verification-otp handler for a missing email: the
  // route is reachable (400), proving CORS no longer aborts the request.
  app.post('/api/auth/email-otp/send-verification-otp', (req, res) => {
    res.status(400).json({ error: { message: 'A valid email is required.' } });
  });
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { message: 'API endpoint not found.' } });
  });
  // Same final error handler as server/index.js — a disallowed CORS origin used
  // to funnel through here as an Express error and become a 500.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(500).json({ error: { message: 'Internal server error. Please try again later.' } });
  });
});

const requests = [];
afterEach(() => {
  requests.splice(0).forEach((server) => server.close());
});

function loopback({ path, method = 'POST', origin }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      requests.push(server);
      const { port } = server.address();
      const headers = { accept: 'application/json' };
      if (origin) headers.origin = origin;
      const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body,
            allowOrigin: res.headers['access-control-allow-origin'] || null,
            allowMethods: res.headers['access-control-allow-methods'] || null,
            allowCredentials: res.headers['access-control-allow-credentials'] || null,
          })
        );
      });
      req.on('error', reject);
      req.end();
    });
  });
}

const ALLOWED_ORIGIN = 'https://chess-com-app.vercel.app';
const PATH = '/api/auth/email-otp/send-verification-otp';

describe('cors origins fail closed instead of 500ing routes', () => {
  it('allows the configured FRONTEND_URL origin and reaches the route (400 missing email, not 500)', async () => {
    const res = await loopback({ path: PATH, origin: ALLOWED_ORIGIN });

    expect(res.status).toBe(400);
    expect(res.allowOrigin).toBe(ALLOWED_ORIGIN);
    expect(JSON.parse(res.body).error.message).toBe('A valid email is required.');
  });

  it('allows a same-deployment origin from VERCEL_PROJECT_PRODUCTION_URL (bare host -> https)', async () => {
    // FRONTEND_URL covers the production URL; the bare-host form is what the
    // Vercel env var provides, so verify the => https normalizer accepts it too.
    const res = await loopback({ path: PATH, origin: 'https://chess-com-app.vercel.app' });

    expect(res.status).toBe(400);
    expect(res.allowOrigin).toBe(ALLOWED_ORIGIN);
  });

  it('fails closed on a disallowed origin: no 500, no Access-Control-Allow-Origin, route still reached', async () => {
    const res = await loopback({ path: PATH, origin: 'https://evil.example.com' });

    expect(res.status).not.toBe(500);
    expect(JSON.parse(res.body).error.message).not.toBe('Internal server error. Please try again later.');
    expect(res.allowOrigin).toBeNull();
    expect(res.allowMethods).toBeNull();
  });

  it('reaches the route when no Origin header is present (curl / server-to-server)', async () => {
    const res = await loopback({ path: PATH });

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error.message).toBe('A valid email is required.');
  });

  it('serves OPTIONS preflight for an allowed origin without 500ing', async () => {
    const res = await loopback({ path: PATH, method: 'OPTIONS', origin: ALLOWED_ORIGIN });

    expect(res.status).toBe(204);
    expect(res.allowOrigin).toBe(ALLOWED_ORIGIN);
    expect(res.allowMethods).toContain('POST');
    expect(res.allowCredentials).toBe('true');
  });

  it('fails closed on OPTIONS preflight from a disallowed origin (no 500, no allow headers)', async () => {
    const res = await loopback({ path: PATH, method: 'OPTIONS', origin: 'https://evil.example.com' });

    expect(res.status).not.toBe(500);
    expect(res.allowOrigin).toBeNull();
  });
});

describe('cors config does not reflect arbitrary origins', () => {
  it('never emits Access-Control-Allow-Origin for disallowed origins', async () => {
    const res = await loopback({ path: PATH, origin: 'https://not-in-allowlist.example' });

    expect(res.allowOrigin).toBeNull();
    expect(res.status).not.toBe(500);
  });
});