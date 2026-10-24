// @vitest-environment node
//
// Exercises the Vercel render handler end to end against mocked session-store
// queries. The renderer module and template are the real build artifacts when
// they exist (the built app renders the personalized shell); on a checkout
// without a prior workspace build the test creates a minimal stub pair so the
// handler contract still runs, and creations are removed afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../artifacts/api-server/src/chess-server/db/query.js', () => ({
  default: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from '../artifacts/api-server/src/chess-server/db/query.js';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const TOKEN = 'a'.repeat(64);
const USER_ROW = {
  id: USER_ID,
  username: 'marina',
  email: 'marina@example.com',
  elo: 1500,
  bullet_elo: 1520,
  rapid_elo: 1500,
  classical_elo: 1480,
  blitz_elo: 1510,
  games_played: 42,
  wins: 20,
  losses: 15,
  draws: 7,
  created_at: '2026-01-01T00:00:00.000Z',
};

const STUB_TEMPLATE = [
  '<!doctype html>',
  '<html lang="en"><head><title>SSR handler stub</title></head>',
  '<body>',
  '<div id="root"></div>',
  '<script type="module" src="/assets/index-stub.js"></script>',
  '</body></html>',
].join('\n');

// Stub renderer: echoes the route and the seeded username so personalized
// renders are visible in the HTML. A URL containing "error-render" throws so
// the 500 fallback path is reachable from tests (only when the stub exists).
const STUB_RENDERER = [
  'export function render(url, opts = {}) {',
  "  if (String(url).includes('error-render')) return Promise.reject(new Error('stub render failure'))",
  "  const username = (opts && opts.user && opts.user.username) || ''",
  "  return Promise.resolve('<div data-stub-app data-url=\"' + url + '\">' + username + '</div>')",
  '}',
].join('\n');

const rendererPath = path.join(
  process.cwd(),
  'artifacts',
  'chess',
  'dist',
  'server',
  'entry-server.js',
);
const templatePath = path.join(process.cwd(), 'dist', 'index.html');
const created = [];

function ensureStub(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  created.push(filePath);
  return true;
}

let handler;

beforeAll(async () => {
  ensureStub(rendererPath, STUB_RENDERER);
  ensureStub(templatePath, STUB_TEMPLATE);
  ({ default: handler } = await import('../api/render.js'));
});

afterAll(() => {
  for (const filePath of created) {
    try {
      fs.rmSync(filePath);
    } catch {}
  }
  for (const dir of [path.dirname(rendererPath), path.dirname(templatePath)]) {
    try {
      fs.rmdirSync(dir);
    } catch {}
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockValidSession(row = USER_ROW) {
  query.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT s.user_id')) {
      return { rows: [{ user_id: USER_ID, expires_at: new Date(Date.now() + 86400000), is_banned: false }] };
    }
    if (sql.startsWith('UPDATE sessions')) return { rows: [] };
    if (sql.includes('FROM users WHERE id')) return { rows: [row] };
    return { rows: [] };
  });
}

function runHandler(headers = {}, url = '/home') {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(key, value) {
        this.headers[String(key).toLowerCase()] = value;
      },
      end(body) {
        this.body = body || '';
        resolve({ status: this.statusCode, headers: this.headers, body: this.body });
      },
    };
    handler({ url, headers }, res).catch(reject);
  });
}

function extractPayloadScriptSource(html) {
  const index = html.indexOf('window["__SSR_USER__"]');
  expect(index).toBeGreaterThan(-1);
  return html.slice(index).split('</script>')[0];
}

function extractPayload(html) {
  return JSON.parse(html.slice(html.indexOf('window["__SSR_USER__"]') + 'window["__SSR_USER__"]='.length).split('</script>')[0].replace(/;$/, ''));
}

describe('session-aware SSR render handler', () => {
  it('renders the personalized shell for a valid session cookie with private, no-store', async () => {
    mockValidSession();

    const response = await runHandler({ cookie: `chess_session=${TOKEN}` }, '/home');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    // The rendered app itself shows the signed-in user's name.
    expect(response.body).toContain('marina');
    // The one-shot adoption payload embeds the same user for the client.
    const payload = extractPayload(response.body);
    expect(payload.username).toBe('marina');
    expect(payload.gamesPlayed).toBe(42);
    expect(payload.needsUsername).toBe(false);
    expect(payload.isAdmin).toBe(false);
    // Session credentials must never reach the HTML.
    expect(response.body).not.toContain(TOKEN);
    // JSON "<" escaping keeps the classic inline script unbreakable.
    expect(extractPayloadScriptSource(response.body)).not.toContain('<');
  });

  it('resolves the session from a Bearer header when no cookie is present', async () => {
    mockValidSession();

    const response = await runHandler({ authorization: `Bearer ${TOKEN}` }, '/home');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(extractPayload(response.body).username).toBe('marina');
  });

  it('renders the anonymous shell with public revalidation when no credentials are sent', async () => {
    const response = await runHandler({}, '/home');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(response.body).not.toContain('__SSR_USER__');
    expect(query).not.toHaveBeenCalled();
  });

  it('renders the anonymous shell with public revalidation for an invalid session', async () => {
    // Session lookup finds no row -> validateSession returns null (expired,
    // revoked, or unknown token) -> treated exactly like an anonymous visit.
    query.mockResolvedValue({ rows: [] });

    const response = await runHandler({ cookie: `chess_session=${TOKEN}` }, '/home');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(response.body).not.toContain('__SSR_USER__');
    expect(response.body).not.toContain('marina');
  });

  it('degrades to the anonymous shell when session validation throws', async () => {
    // A cold/unreachable database throws during validation; the render must
    // still succeed anonymously instead of failing the request.
    query.mockRejectedValue(new Error('Database pool not initialized. Check DATABASE_URL.'));

    const response = await runHandler({ cookie: `chess_session=${TOKEN}` }, '/home');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(response.body).not.toContain('__SSR_USER__');
  });

  it('runs the SSR diagnostic only in Vercel preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    try {
      const response = await runHandler({}, '/api/render?__route=/play&__ssr_diagnostic=1');

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true, stage: 'complete', error: null });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps the 500 + plain-template fallback when rendering fails', async () => {
    // Uses the stub renderer's failure mode; skipped when the real built
    // renderer is in place so the built artifact is never modified.
    const usedStubRenderer = created.includes(rendererPath);
    if (!usedStubRenderer) return;

    mockValidSession();

    const response = await runHandler({ cookie: `chess_session=${TOKEN}` }, '/error-render');

    expect(response.status).toBe(500);
    // The response is the plain template fallback (no rendered app markup,
    // and no adoption payload on the degraded path).
    expect(response.body).not.toContain('data-stub-app');
    expect(response.body).not.toContain('__SSR_USER__');
  });
});
