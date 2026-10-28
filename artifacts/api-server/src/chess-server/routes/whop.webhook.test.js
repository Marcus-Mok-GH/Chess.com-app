import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../db.js';

const SECRET = 'whsec_' + Buffer.from('test-signing-key-bytes').toString('base64');

let whopRoutes;

async function loadRoutes() {
  const module = await import('./whop.js');
  whopRoutes = module.default;
}

// Mirrors index.js: the raw-body webhook is mounted before express.json().
function buildApp() {
  const app = express();
  app.use('/api/whop', whopRoutes);
  app.use(express.json());
  return app;
}

function post(app, path, payload, headers) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...headers,
          },
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () =>
            server.close(() => {
              let parsed;
              try {
                parsed = JSON.parse(buf);
              } catch {
                parsed = buf;
              }
              resolve({ status: res.statusCode, body: parsed });
            })
          );
        }
      );
      req.on('error', (e) => server.close(() => reject(e)));
      req.write(body);
      req.end();
    });
  });
}

function sign(rawBody, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

function activatedEvent(overrides = {}) {
  return {
    type: 'membership.activated',
    data: {
      id: 'mem_123',
      plan_id: 'plan_789',
      status: 'active',
      email: 'player@example.com',
      renewal_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      ...overrides,
    },
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  query.mockResolvedValue({ rows: [] });
  await loadRoutes();
});

describe('POST /api/whop/webhook', () => {
  it('rejects with 503 when the webhook secret is not configured', async () => {
    delete process.env.WHOP_WEBHOOK_SECRET;
    const app = buildApp();
    const payload = activatedEvent();
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('webhook_not_configured');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a delivery with an invalid signature', async () => {
    const app = buildApp();
    const payload = activatedEvent();
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, {
      ...sign(raw),
      'webhook-signature': 'v1,not-a-real-signature',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a signature outside the timestamp tolerance window', async () => {
    const app = buildApp();
    const payload = activatedEvent();
    const raw = JSON.stringify(payload);
    const stale = Math.floor(Date.now() / 1000) - 60 * 60;

    const res = await post(app, '/api/whop/webhook', raw, sign(raw, { timestamp: stale }));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('returns 400 for a signed but malformed body', async () => {
    const app = buildApp();
    const raw = '{"type": "membership.activated", ';

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });

  it('upserts an active subscription resolved by email', async () => {
    query.mockImplementation(async (sql) => {
      if (/FROM subscriptions WHERE whop_membership_id/.test(sql)) return { rows: [] };
      if (/FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: [{ id: 'user-1' }] };
      return { rows: [] };
    });
    const app = buildApp();
    const payload = activatedEvent();
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const upsert = query.mock.calls.find(([sql]) => /INSERT INTO subscriptions/.test(sql));
    expect(upsert).toBeTruthy();
    const params = upsert[1];
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('mem_123');
    expect(params[2]).toBe('plan_789');
    expect(params[3]).toBe('active');
    expect(params[4]).toBeInstanceOf(Date);
  });

  it('resolves the user by an existing membership id without a second email lookup', async () => {
    query.mockImplementation(async (sql) => {
      if (/FROM subscriptions WHERE whop_membership_id/.test(sql)) {
        return { rows: [{ user_id: 'user-42' }] };
      }
      return { rows: [] };
    });
    const app = buildApp();
    const payload = activatedEvent();
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(200);
    const emailLookup = query.mock.calls.find(([sql]) => /FROM users WHERE LOWER\(email\)/.test(sql));
    expect(emailLookup).toBeUndefined();
    const upsert = query.mock.calls.find(([sql]) => /INSERT INTO subscriptions/.test(sql));
    expect(upsert[1][0]).toBe('user-42');
  });

  it('marks the subscription inactive on a deactivation event', async () => {
    query.mockImplementation(async (sql) => {
      if (/FROM subscriptions WHERE whop_membership_id/.test(sql)) {
        return { rows: [{ user_id: 'user-1' }] };
      }
      return { rows: [] };
    });
    const app = buildApp();
    const payload = {
      type: 'membership.deactivated',
      data: { id: 'mem_123', plan_id: 'plan_789' },
    };
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(200);
    const upsert = query.mock.calls.find(([sql]) => /INSERT INTO subscriptions/.test(sql));
    expect(upsert[1][3]).toBe('inactive');
  });

  it('acknowledges but ignores an event with no membership id', async () => {
    const app = buildApp();
    const payload = { type: 'membership.activated', data: { plan_id: 'plan_789' } };
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('no_membership_id');
    expect(query).not.toHaveBeenCalled();
  });

  it('acknowledges but ignores a membership that matches no local user', async () => {
    const app = buildApp();
    const payload = activatedEvent({ email: 'stranger@example.com' });
    const raw = JSON.stringify(payload);

    const res = await post(app, '/api/whop/webhook', raw, sign(raw));

    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('no_matching_user');
    const upsert = query.mock.calls.find(([sql]) => /INSERT INTO subscriptions/.test(sql));
    expect(upsert).toBeUndefined();
  });
});