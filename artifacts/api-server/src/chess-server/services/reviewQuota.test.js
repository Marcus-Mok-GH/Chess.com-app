import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../db.js';
import {
  FREE_DAILY_LIMIT,
  consumeReview,
  getDailyLimit,
  getUsage,
  getUsedToday,
  subscriptionIsActive,
} from './reviewQuota.js';

function futureDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('subscriptionIsActive', () => {
  it('rejects a missing row', () => {
    expect(subscriptionIsActive(null)).toBe(false);
    expect(subscriptionIsActive(undefined)).toBe(false);
  });

  it('rejects unknown or inactive statuses', () => {
    expect(subscriptionIsActive({ status: 'inactive', current_period_end: futureDate() })).toBe(false);
    expect(subscriptionIsActive({ status: 'canceled', current_period_end: futureDate() })).toBe(false);
    expect(subscriptionIsActive({ status: '', current_period_end: futureDate() })).toBe(false);
  });

  it('accepts entitled statuses without a period end', () => {
    expect(subscriptionIsActive({ status: 'active' })).toBe(true);
    expect(subscriptionIsActive({ status: 'trialing' })).toBe(true);
    expect(subscriptionIsActive({ status: 'past_due' })).toBe(true);
  });

  it('is case-insensitive on status', () => {
    expect(subscriptionIsActive({ status: 'ACTIVE', current_period_end: futureDate() })).toBe(true);
  });

  it('rejects an entitled status once the period has ended', () => {
    expect(subscriptionIsActive({ status: 'active', current_period_end: pastDate() })).toBe(false);
  });

  it('ignores an unparseable period end rather than revoking access', () => {
    expect(subscriptionIsActive({ status: 'active', current_period_end: 'not-a-date' })).toBe(true);
  });
});

describe('getDailyLimit', () => {
  it('returns Infinity for an active subscriber', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: futureDate() }] });
    await expect(getDailyLimit('user-1')).resolves.toBe(Infinity);
  });

  it('returns the free limit when there is no subscription row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getDailyLimit('user-1')).resolves.toBe(FREE_DAILY_LIMIT);
  });

  it('returns the free limit when the subscription has lapsed', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: pastDate() }] });
    await expect(getDailyLimit('user-1')).resolves.toBe(FREE_DAILY_LIMIT);
  });
});

describe('getUsedToday', () => {
  it('returns 0 when there is no usage row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getUsedToday('user-1')).resolves.toBe(0);
  });

  it('returns the stored count as a number', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    await expect(getUsedToday('user-1')).resolves.toBe(2);
  });

  it('falls back to 0 for a non-numeric count', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: null }] });
    await expect(getUsedToday('user-1')).resolves.toBe(0);
  });
});

describe('consumeReview', () => {
  it('returns the new total from the upsert', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    await expect(consumeReview('user-1')).resolves.toBe(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO review_usage/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, usage_date\)/);
    expect(params).toEqual(['user-1']);
  });

  it('defaults to 1 when the upsert returns no row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(consumeReview('user-1')).resolves.toBe(1);
  });
});

describe('getUsage', () => {
  it('reports a free account that still has its review', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const usage = await getUsage('user-1');

    expect(usage).toMatchObject({
      used: 0,
      limit: FREE_DAILY_LIMIT,
      remaining: FREE_DAILY_LIMIT,
      unlimited: false,
      allowed: true,
    });
    expect(new Date(usage.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks a free account that has used today\'s review', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const usage = await getUsage('user-1');

    expect(usage).toMatchObject({
      used: 1,
      limit: FREE_DAILY_LIMIT,
      remaining: 0,
      unlimited: false,
      allowed: false,
    });
  });

  it('never blocks and omits counters for a subscriber', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: futureDate() }] })
      .mockResolvedValueOnce({ rows: [{ count: 12 }] });

    const usage = await getUsage('user-1');

    expect(usage).toMatchObject({
      used: 12,
      limit: null,
      remaining: null,
      unlimited: true,
      allowed: true,
    });
  });
});