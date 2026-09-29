import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATING,
  ratingColumnFor,
  ratingForControl,
} from './ratingPools.js';

describe('ratingColumnFor', () => {
  it('maps both rapid variants to rapid_elo and everything else to elo', () => {
    expect(ratingColumnFor('rapid')).toBe('rapid_elo');
    expect(ratingColumnFor('rapid_10_3')).toBe('rapid_elo');
    expect(ratingColumnFor('unlimited')).toBe('elo');
    expect(ratingColumnFor(undefined)).toBe('elo');
    expect(ratingColumnFor('blitz')).toBe('elo');
  });
});

describe('ratingForControl', () => {
  it('reads the rating from the column for that control', () => {
    const user = { elo: 1300, rapid_elo: 1500 };
    expect(ratingForControl(user, 'unlimited')).toBe(1300);
    expect(ratingForControl(user, 'rapid')).toBe(1500);
    expect(ratingForControl(user, 'rapid_10_3')).toBe(1500);
  });

  it('falls back to the default for missing or invalid values', () => {
    expect(ratingForControl({}, 'rapid')).toBe(DEFAULT_RATING);
    expect(ratingForControl({ rapid_elo: 'nonsense' }, 'rapid')).toBe(DEFAULT_RATING);
    expect(ratingForControl(null, 'rapid')).toBe(DEFAULT_RATING);
  });

  it('clamps out-of-range values', () => {
    expect(ratingForControl({ elo: 5 }, 'unlimited')).toBe(100);
    expect(ratingForControl({ elo: 99999 }, 'unlimited')).toBe(4000);
  });
});
