import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db.js', () => ({
  query: vi.fn(async () => ({ rows: [{ user_id: 7 }] })),
}));

vi.mock('./auth.js', () => ({
  getSessionToken: vi.fn(() => 'session-token'),
  validateSession: vi.fn(async () => 7),
}));

import { query } from './db.js';

const DISCOVERY = {
  authorization_endpoint: 'https://enter.pollinations.ai/authorize',
  token_endpoint: 'https://enter.pollinations.ai/token',
};

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function loadModule() {
  vi.resetModules();
  return import('./coachAuth.js');
}

describe('coachAuth expiry', () => {
  beforeEach(() => {
    process.env.POLLINATIONS_CLIENT_ID = 'pk_test';
    process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
    delete process.env.POLLINATIONS_COACH_EXPIRY_DAYS;
    query.mockClear();
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('.well-known')) return jsonResponse(DISCOVERY);
      return jsonResponse({ access_token: 'sk_test', scope: 'profile usage' });
    });
  });

  afterEach(() => {
    delete process.env.POLLINATIONS_CLIENT_ID;
    delete process.env.POLLINATIONS_TOKEN_ENCRYPTION_KEY;
    delete process.env.POLLINATIONS_COACH_EXPIRY_DAYS;
  });

  it('asks Pollinations for a month by default', async () => {
    const { createAuthorizationUrl } = await loadModule();
    const { authorizationUrl } = await createAuthorizationUrl({ headers: { host: 'example.test' } });
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('expiry')).toBe('30');
    expect(url.searchParams.get('budget')).toBe('5');
  });

  it('honours a configured lifetime', async () => {
    process.env.POLLINATIONS_COACH_EXPIRY_DAYS = '14';
    const { createAuthorizationUrl } = await loadModule();
    const { authorizationUrl } = await createAuthorizationUrl({ headers: { host: 'example.test' } });
    expect(new URL(authorizationUrl).searchParams.get('expiry')).toBe('14');
  });

  it('falls back to a month when the token response omits expires_in', async () => {
    const before = Date.now();
    const { completeAuthorization } = await loadModule();
    await completeAuthorization('code', 'state');

    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO pollinations_coach_tokens'));
    expect(insert).toBeTruthy();
    const expiresAt = new Date(insert[1][2]).getTime();
    const days = (expiresAt - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});
