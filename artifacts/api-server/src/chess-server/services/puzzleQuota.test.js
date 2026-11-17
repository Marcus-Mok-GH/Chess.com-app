import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../coachAuth.js', () => ({
  authenticatedUserId: vi.fn(),
}));

vi.mock('./antiCheatService.js', () => ({
  isIntegrityReviewer: vi.fn(() => false),
}));

import { query } from '../db.js';
import { authenticatedUserId } from '../coachAuth.js';
import { isIntegrityReviewer } from './antiCheatService.js';
import {
  FREE_DAILY_LIMIT,
  VISITOR_COOKIE,
  consumePuzzle,
  getDailyLimit,
  getUsage,
  getUsedToday,
  ownerKeyFor,
  visitorId,
} from './puzzleQuota.js';

function futureDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeRes() {
  return { cookie: vi.fn() };
}

function makeReq(cookieHeader) {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} };
}

beforeEach(() => {
  vi.resetAllMocks();
  isIntegrityReviewer.mockReturnValue(false);
  authenticatedUserId.mockResolvedValue(null);
});

describe('FREE_DAILY_LIMIT', () => {
  it('is three puzzles a day', () => {
    expect(FREE_DAILY_LIMIT).toBe(3);
  });
});

describe('visitorId', () => {
  it('issues a fresh 32-hex id and sets the cookie', () => {
    const res = makeRes();
    const id = visitorId(makeReq(), res);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(res.cookie).toHaveBeenCalledWith(VISITOR_COOKIE, id, expect.objectContaining({ httpOnly: true }));
  });

  it('reuses a valid cookie instead of issuing a new id', () => {
    const existing = 'a'.repeat(32);
    const res = makeRes();
    expect(visitorId(makeReq(`${VISITOR_COOKIE}=${existing}`), res)).toBe(existing);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('replaces a tampered cookie value', () => {
    const res = makeRes();
    const id = visitorId(makeReq(`${VISITOR_COOKIE}=../../etc/passwd`), res);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(res.cookie).toHaveBeenCalled();
  });
});

describe('ownerKeyFor', () => {
  it('counts a signed-in player per account', async () => {
    authenticatedUserId.mockResolvedValue('user-42');
    await expect(ownerKeyFor(makeReq(`${VISITOR_COOKIE}=${'b'.repeat(32)}`), makeRes())).resolves.toBe('user:user-42');
  });

  it('counts a guest per device cookie', async () => {
    const id = 'c'.repeat(32);
    await expect(ownerKeyFor(makeReq(`${VISITOR_COOKIE}=${id}`), makeRes())).resolves.toBe(`anon:${id}`);
  });
});

describe('getDailyLimit', () => {
  it('gives guests three puzzles', async () => {
    await expect(getDailyLimit(`anon:${'d'.repeat(32)}`)).resolves.toBe(FREE_DAILY_LIMIT);
    expect(query).not.toHaveBeenCalled();
  });

  it('gives an unsubscribed account three puzzles', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getDailyLimit('user:user-42')).resolves.toBe(FREE_DAILY_LIMIT);
  });

  it('gives an active subscription unlimited puzzles', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: futureDate() }] });
    await expect(getDailyLimit('user:user-42')).resolves.toBe(Infinity);
  });

  it('reverts an expired subscription to the free limit', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: pastDate() }] });
    await expect(getDailyLimit('user:user-42')).resolves.toBe(FREE_DAILY_LIMIT);
  });

  it('never limits an integrity reviewer', async () => {
    isIntegrityReviewer.mockReturnValue(true);
    await expect(getDailyLimit('user:reviewer-1')).resolves.toBe(Infinity);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getUsedToday', () => {
  it('returns the stored count for today', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: 2 }] });
    await expect(getUsedToday('user:user-42')).resolves.toBe(2);
    expect(query.mock.calls[0][0]).toMatch(/puzzle_usage/);
    expect(query.mock.calls[0][0]).toMatch(/CURRENT_DATE/);
  });

  it('returns zero when the owner has no row yet', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getUsedToday('user:user-42')).resolves.toBe(0);
  });
});

describe('consumePuzzle', () => {
  it('increments atomically and returns the new count', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
    await expect(consumePuzzle('user:user-42')).resolves.toBe(3);
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/INSERT INTO puzzle_usage/);
    expect(sql).toMatch(/ON CONFLICT \(owner_key, usage_date\)/);
    expect(sql).toMatch(/count = puzzle_usage\.count \+ 1/);
  });
});

describe('getUsage', () => {
  it('allows the third puzzle and reports what is left', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // subscription lookup
    query.mockResolvedValueOnce({ rows: [{ count: 2 }] }); // usage
    const usage = await getUsage('user:user-42');
    expect(usage).toMatchObject({ used: 2, limit: 3, remaining: 1, unlimited: false, allowed: true });
    expect(new Date(usage.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks the fourth puzzle of the day', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
    const usage = await getUsage('user:user-42');
    expect(usage).toMatchObject({ used: 3, remaining: 0, allowed: false });
  });

  it('reports unlimited usage for a subscriber', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: futureDate() }] });
    query.mockResolvedValueOnce({ rows: [{ count: 40 }] });
    const usage = await getUsage('user:user-42');
    expect(usage).toMatchObject({ used: 40, limit: null, remaining: null, unlimited: true, allowed: true });
  });
});
