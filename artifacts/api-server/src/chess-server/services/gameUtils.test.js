import { describe, expect, it } from 'vitest';
import { userIdFromPlayerId, hasValidEloPair } from './gameUtils.js';

describe('userIdFromPlayerId', () => {
  it('parses legacy numeric user ids', () => {
    expect(userIdFromPlayerId(7)).toBe(7);
    expect(userIdFromPlayerId('7')).toBe(7);
    expect(userIdFromPlayerId('user_7')).toBe(7);
    expect(userIdFromPlayerId('user_7_tracedsession')).toBe(7);
  });

  it('parses uuid-style ids', () => {
    const uuid = 'be827321-f624-4051-a300-63c7a52f128e';
    expect(userIdFromPlayerId(uuid)).toBe(uuid);
    expect(userIdFromPlayerId(`user_${uuid}`)).toBe(uuid);
    expect(userIdFromPlayerId(`user_${uuid}_abc123`)).toBe(uuid);
  });

  it('returns null for unparseable ids', () => {
    expect(userIdFromPlayerId(null)).toBeNull();
    expect(userIdFromPlayerId(undefined)).toBeNull();
    expect(userIdFromPlayerId('')).toBeNull();
    expect(userIdFromPlayerId('guest_abc')).toBeNull();
    expect(userIdFromPlayerId('not-a-player')).toBeNull();
    expect(userIdFromPlayerId(-5)).toBeNull();
    expect(userIdFromPlayerId(0)).toBeNull();
  });
});

describe('hasValidEloPair', () => {
  it('accepts a game with numeric elos', () => {
    expect(hasValidEloPair({ white_elo: 1200, black_elo: 1400 })).toBe(true);
  });

  it('rejects games with missing or invalid elos', () => {
    expect(hasValidEloPair({ white_elo: null, black_elo: 1200 })).toBe(false);
    expect(hasValidEloPair({ white_elo: 1200 })).toBe(false);
    expect(hasValidEloPair({ white_elo: '1200', black_elo: 1200 })).toBe(false);
    expect(hasValidEloPair(null)).toBe(false);
    expect(hasValidEloPair({})).toBe(false);
  });
});