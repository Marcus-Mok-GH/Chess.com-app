// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real token-extraction helper (Bearer first, then the chess_session
// cookie) stays live so the documented precedence is pinned; only the
// session-store round-trip is mocked.
vi.mock('./auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateSession: vi.fn(),
  };
});

vi.mock('./db.js', () => ({
  default: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
  initDatabase: vi.fn(),
  cleanupOldActiveGames: vi.fn(),
  cleanupStaleMatchmakingEntries: vi.fn(),
}));

import { validateSession } from './auth.js';
import { query } from './db.js';
import { getSessionUserFromHeaders } from './ssrSession.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CHESS_REVIEW_ADMIN_IDS;
});

function mockUserRowLookup() {
  query.mockImplementation(async (sql) => {
    if (sql.includes('FROM users WHERE id = $1')) return { rows: [USER_ROW] };
    return { rows: [] };
  });
}

describe('getSessionUserFromHeaders', () => {
  it('returns null for anonymous requests without touching the database', async () => {
    expect(await getSessionUserFromHeaders({})).toBeNull();
    expect(validateSession).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('prefers the Bearer header over the cookie', async () => {
    validateSession.mockResolvedValue(USER_ID);
    mockUserRowLookup();

    const user = await getSessionUserFromHeaders({
      authorization: `Bearer ${TOKEN}`,
      cookie: `chess_session=stale${TOKEN}`,
    });

    expect(validateSession).toHaveBeenCalledWith(TOKEN);
    expect(user?.id).toBe(USER_ID);
  });

  it('falls back to the chess_session cookie when no Bearer header is present', async () => {
    validateSession.mockResolvedValue(USER_ID);
    mockUserRowLookup();

    const user = await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` });

    expect(validateSession).toHaveBeenCalledWith(TOKEN);
    expect(user?.id).toBe(USER_ID);
  });

  it('returns null for invalid/expired/banned sessions without a users lookup', async () => {
    validateSession.mockResolvedValue(null);

    expect(await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates session-store failures so the caller can degrade to anonymous', async () => {
    validateSession.mockRejectedValue(new Error('Database pool not initialized. Check DATABASE_URL.'));

    await expect(
      getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` }),
    ).rejects.toThrow('Database pool not initialized');
  });

  it('returns null when the session is valid but the user row is gone', async () => {
    validateSession.mockResolvedValue(USER_ID);
    query.mockResolvedValue({ rows: [] });

    expect(await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` })).toBeNull();
  });

  it('shapes the payload with the user data the client context expects', async () => {
    validateSession.mockResolvedValue(USER_ID);
    mockUserRowLookup();

    const user = await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` });

    expect(user).toEqual({
      id: USER_ID,
      username: 'marina',
      email: 'marina@example.com',
      elo: 1500,
      rapidElo: 1500,
      classicalElo: 1480,
      blitzElo: 1510,
      bulletElo: 1520,
      gamesPlayed: 42,
      wins: 20,
      losses: 15,
      draws: 7,
      createdAt: '2026-01-01T00:00:00.000Z',
      needsUsername: false,
      isAdmin: false,
    });
    // The payload is profile data only — session credentials must never
    // travel with it.
    expect(JSON.stringify(user)).not.toContain(TOKEN);
    expect(user.token).toBeUndefined();
    expect(user.session).toBeUndefined();
  });

  it('applies the elo fallback when rating columns are unset', async () => {
    validateSession.mockResolvedValue(USER_ID);
    query.mockResolvedValue({
      rows: [{ ...USER_ROW, bullet_elo: null, blitz_elo: null }],
    });

    const user = await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` });

    expect(user.bulletElo).toBe(1500);
    expect(user.blitzElo).toBe(1500);
  });

  it('flags server-assigned player_* usernames as needing a username', async () => {
    validateSession.mockResolvedValue(USER_ID);
    query.mockResolvedValue({ rows: [{ ...USER_ROW, username: 'player_ab12cd34' }] });

    const user = await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` });

    expect(user.needsUsername).toBe(true);
  });

  it('marks admin ids from CHESS_REVIEW_ADMIN_IDS like the session route', async () => {
    process.env.CHESS_REVIEW_ADMIN_IDS = `${USER_ID}, someoneelse`;
    validateSession.mockResolvedValue(USER_ID);
    mockUserRowLookup();

    const user = await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` });

    expect(user?.isAdmin).toBe(true);
  });

  it('renders rows without a username anonymous (the client could never persist them)', async () => {
    validateSession.mockResolvedValue(USER_ID);
    query.mockResolvedValue({ rows: [{ ...USER_ROW, username: null }] });

    expect(await getSessionUserFromHeaders({ cookie: `chess_session=${TOKEN}` })).toBeNull();
  });
});
