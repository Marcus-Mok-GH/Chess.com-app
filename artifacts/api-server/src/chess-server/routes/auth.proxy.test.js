/**
 * Regression tests for the Neon Auth email-OTP proxy contract.
 *
 * Covers the two bugs fixed in the login flow:
 *   1. proxyToNeonAuth must strip the local /api/auth prefix before joining
 *      onto NEON_AUTH_BASE_URL (otherwise upstream sees a non-existent route
 *      and 404s with an empty body).
 *   2. send-verification-otp / resend default body.type to "sign-in" when the
 *      caller omits it, while preserving an explicit override.
 *
 * Standalone — uses only `express` (already a dependency), Node's built-in
 * `http` for loopback calls, and a monkey-patched global `fetch` to capture
 * the proxy's outbound request. Run with:
 *   node --test routes/auth.proxy.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () =>
        typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body ?? {}),
    };
  };
  return calls;
}

/** Fire a loopback HTTP request against an express app on an ephemeral port. */
function loopback(app, method, path, bodyObj) {
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

test('send-verification-otp: strips /api/auth prefix from upstream URL', async () => {
  const calls = mockFetch({ status: 200, body: { success: true } });
  await loopback(
    buildApp(),
    'POST',
    '/api/auth/email-otp/send-verification-otp',
    { email: 'user@example.com' }
  );
  assert.ok(calls.length >= 1, 'proxy did not call fetch');
  for (const c of calls) {
    assert.ok(!c.url.includes('/api/auth/'), `upstream URL still has /api/auth/: ${c.url}`);
    assert.ok(c.url.startsWith(BASE_URL), `upstream URL wrong base: ${c.url}`);
  }
});

test('send-verification-otp: defaults body.type to "sign-in" when omitted', async () => {
  const calls = mockFetch({ status: 200, body: { success: true } });
  await loopback(
    buildApp(),
    'POST',
    '/api/auth/email-otp/send-verification-otp',
    { email: 'user@example.com' }
  );
  const outbound = JSON.parse(calls[0].opts.body);
  assert.equal(outbound.type, 'sign-in');
  assert.equal(outbound.email, 'user@example.com');
});

test('send-verification-otp: preserves explicit body.type override', async () => {
  const calls = mockFetch({ status: 200, body: { success: true } });
  await loopback(
    buildApp(),
    'POST',
    '/api/auth/email-otp/send-verification-otp',
    { email: 'u@example.com', type: 'email-verification' }
  );
  const outbound = JSON.parse(calls[0].opts.body);
  assert.equal(outbound.type, 'email-verification');
});

test('resend: defaults type to "sign-in" and strips /api/auth prefix', async () => {
  const calls = mockFetch({ status: 200, body: { success: true } });
  await loopback(
    buildApp(),
    'POST',
    '/api/auth/email-otp/resend',
    { email: 'u@example.com' }
  );
  assert.ok(calls.length >= 1, 'resend did not call fetch');
  assert.ok(!calls[0].url.includes('/api/auth/'), `resend upstream has /api/auth/: ${calls[0].url}`);
  const outbound = JSON.parse(calls[0].opts.body);
  assert.equal(outbound.type, 'sign-in');
});
