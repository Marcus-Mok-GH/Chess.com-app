import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('./antiCheatService.js', () => ({
  isIntegrityReviewer: vi.fn(() => false),
}));

import { query } from '../db.js';
import { isIntegrityReviewer } from './antiCheatService.js';
import {
  FREE_PUZZLE_LIMIT,
  FREE_REVIEW_LIMIT,
  PLANS,
  getEntitlements,
  subscriptionIsActive,
} from './entitlements.js';

function futureDate(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pastDate(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.resetAllMocks();
  isIntegrityReviewer.mockReturnValue(false);
});

describe('free plan', () => {
  it('is what a guest gets, with no database read', async () => {
    const entitlements = await getEntitlements(null);
    expect(entitlements.plan).toBe(PLANS.FREE);
    expect(entitlements.puzzleLimit).toBe(FREE_PUZZLE_LIMIT);
    expect(entitlements.reviewLimit).toBe(FREE_REVIEW_LIMIT);
    expect(entitlements.premiumBots).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('applies to an account with no subscription row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const entitlements = await getEntitlements('user-42');
    expect(entitlements.plan).toBe(PLANS.FREE);
    expect(entitlements.unlimitedPuzzles).toBe(false);
  });

  it('applies again once a subscription lapses', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: pastDate() }] });
    const entitlements = await getEntitlements('user-42');
    expect(entitlements.plan).toBe(PLANS.FREE);
  });
});

describe('premium plan', () => {
  it('lifts every daily limit and unlocks premium bots', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: futureDate() }] });
    const entitlements = await getEntitlements('user-42');

    expect(entitlements.plan).toBe(PLANS.PREMIUM);
    expect(entitlements.premium).toBe(true);
    expect(entitlements.premiumBots).toBe(true);
    expect(entitlements.puzzleLimit).toBeNull();
    expect(entitlements.reviewLimit).toBeNull();
    expect(entitlements.unlimitedPuzzles).toBe(true);
    expect(entitlements.unlimitedReviews).toBe(true);
    expect(entitlements.unlocks).toContain('Unlimited puzzles');
  });
});

describe('admin plan', () => {
  it('gets everything premium gets, without reading subscriptions', async () => {
    isIntegrityReviewer.mockReturnValue(true);
    const entitlements = await getEntitlements('admin-1');

    expect(entitlements.plan).toBe(PLANS.ADMIN);
    expect(entitlements.isAdmin).toBe(true);
    expect(entitlements.puzzleLimit).toBeNull();
    expect(entitlements.reviewLimit).toBeNull();
    expect(entitlements.premiumBots).toBe(true);
    expect(entitlements.unlocks).toEqual(expect.arrayContaining(['Unlimited puzzles', 'Premium bots']));
    expect(query).not.toHaveBeenCalled();
  });

  it('is not downgraded by an expired subscription row', async () => {
    isIntegrityReviewer.mockReturnValue(true);
    query.mockResolvedValueOnce({ rows: [{ status: 'canceled', current_period_end: pastDate() }] });
    const entitlements = await getEntitlements('admin-1');
    expect(entitlements.plan).toBe(PLANS.ADMIN);
    expect(entitlements.unlimitedReviews).toBe(true);
  });
});

describe('subscriptionIsActive', () => {
  it('accepts entitled statuses within the paid period', () => {
    expect(subscriptionIsActive({ status: 'active', current_period_end: futureDate() })).toBe(true);
    expect(subscriptionIsActive({ status: 'trialing' })).toBe(true);
    expect(subscriptionIsActive({ status: 'past_due', current_period_end: futureDate() })).toBe(true);
  });

  it('rejects missing, inactive and expired rows', () => {
    expect(subscriptionIsActive(null)).toBe(false);
    expect(subscriptionIsActive({ status: 'inactive' })).toBe(false);
    expect(subscriptionIsActive({ status: 'active', current_period_end: pastDate() })).toBe(false);
  });
});
