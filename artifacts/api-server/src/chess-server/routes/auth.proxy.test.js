/**
 * Regression tests for the Neon Auth email-OTP proxy contract.
 *
 * Covers the two bugs fixed in the login flow:
 *   1. proxyToNeonAuth must strip the local /api/auth prefix before joining
 *      onto NEON_AUTH_BASE_URL (otherwise upstream sees a non-existent route
 *      and 404s with an empty body).
 *   2. send-verification-otp / resend default body.type to "sign-in" when the
 *      caller omits it, while preserving an explicit override.
 *   3. the proxy must not forward the app's own session cookie upstream, which
 *      made Better Auth run its origin/CSRF check and reject login with
 *      "Missing or null Origin" / "Invalid origin".
 *   4. the proxy sets the upstream Origin to Neon Auth's own origin (Better
 *      Auth always trusts it), instead of relaying the browser's Origin which
 *      Neon rejects with 403 "Invalid origin".
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import express from 'express';

const BASE_URL = 'https://example.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth';
process.env.NEON_AUTH_BASE_URL = BASE_URL;

// import AFTER setting env so the router reads the correct value
const { default: authRouter } = await import('./auth.js');

// --- helpers ----------------------------------------------------------------

/** Queue a fetch mock; returns the list of recorded outbound calls. */
function mockFetch(response) {
  const calls = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    calls.push({ url: String(url), opts });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () =>
        typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body ?? {}),
    };
  });
  return calls;
}

/** Fire a loopback HTTP request against an express app on an ephemeral port. */
function loopback(app, method, path, bodyObj, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const data = JSON.stringify(bodyObj ?? {});
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(data),
            ...extraHeaders,
          },
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body: buf })));
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      req.write(data);
      req.end();
    });
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

// --- tests ------------------------------------------------------------------

describe('Neon Auth proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('send-verification-otp: strips /api/auth prefix from upstream URL', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/send-verification-otp',
      { email: 'user@example.com' }
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      expect(c.url).not.toContain('/api/auth/');
      expect(c.url).toMatch(new RegExp(`^${BASE_URL}`));
    }
  });

  it('send-verification-otp: defaults body.type to "sign-in" when omitted', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/send-verification-otp',
      { email: 'user@example.com' }
    );
    const outbound = JSON.parse(calls[0].opts.body);
    expect(outbound.type).toBe('sign-in');
    expect(outbound.email).toBe('user@example.com');
  });

  it('send-verification-otp: preserves explicit body.type override', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/send-verification-otp',
      { email: 'u@example.com', type: 'email-verification' }
    );
    const outbound = JSON.parse(calls[0].opts.body);
    expect(outbound.type).toBe('email-verification');
  });

  it('sets upstream Origin to the Neon Auth base URL origin', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/send-verification-otp',
      { email: 'user@example.com' },
      { origin: 'https://chess.example.com' }
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // Neon's hosted Better Auth enforces its origin/CSRF check unconditionally
    // and rejects app origins with 403 "Invalid origin". Better Auth always
    // trusts its own origin, so the proxy presents itself as Neon Auth.
    expect(calls[0].opts.headers.origin).toBe(new URL(BASE_URL).origin);
  });

  it('never forwards the app session cookie to Neon Auth', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/send-verification-otp',
      { email: 'user@example.com' },
      { origin: 'https://chess.example.com', cookie: 'chess_session=deadbeefdeadbeef' }
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // Forwarding our own `chess_session` cookie made Neon treat the call as a
    // browser request and reject the login with 403 "Invalid origin".
    expect(calls[0].opts.headers.cookie).toBeUndefined();
    // The Origin is the Neon Auth origin regardless of the client's header.
    expect(calls[0].opts.headers.origin).toBe(new URL(BASE_URL).origin);
  });

  it('resend: defaults type to "sign-in" and strips /api/auth prefix', async () => {
    const calls = mockFetch({ status: 200, body: { success: true } });
    await loopback(
      buildApp(),
      'POST',
      '/api/auth/email-otp/resend',
      { email: 'u@example.com' }
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].url).not.toContain('/api/auth/');
    const outbound = JSON.parse(calls[0].opts.body);
    expect(outbound.type).toBe('sign-in');
  });
});
