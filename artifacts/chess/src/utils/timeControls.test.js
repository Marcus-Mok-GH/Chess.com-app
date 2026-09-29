import { describe, it, expect } from 'vitest';
import {
  RAPID_MS,
  CLASSICAL_MS,
  RAPID_INCREMENT_MS,
  TIME_CONTROLS,
  RATING_POOLS,
  DEFAULT_TIME_CONTROL,
  initialClockMs,
  incrementMsFor,
  isTimedControl,
  ratingPoolForControl,
  formatClock,
  timeControlLabel,
  timeControlDescription,
  isLowTime,
  controlRating,
} from './timeControls';

describe('timeControls', () => {
  it('exposes every control with server-matching ids', () => {
    expect(TIME_CONTROLS.map((t) => t.id)).toEqual([
      'unlimited',
      'rapid',
      'rapid_10_3',
      'classical',
    ]);
    expect(DEFAULT_TIME_CONTROL).toBe('unlimited');
  });

  it('starts the rapid variants at ten minutes and classical at thirty', () => {
    expect(initialClockMs('rapid')).toBe(RAPID_MS);
    expect(initialClockMs('rapid_10_3')).toBe(RAPID_MS);
    expect(initialClockMs('classical')).toBe(CLASSICAL_MS);
    expect(initialClockMs('unlimited')).toBeNull();
    expect(initialClockMs(undefined)).toBeNull();
  });

  it('applies a three-second increment only to rapid 10+3', () => {
    expect(incrementMsFor('rapid_10_3')).toBe(RAPID_INCREMENT_MS);
    expect(incrementMsFor('rapid')).toBe(0);
    expect(incrementMsFor('classical')).toBe(0);
    expect(incrementMsFor('unlimited')).toBe(0);
  });

  it('treats every rapid variant and classical as timed', () => {
    expect(isTimedControl('rapid')).toBe(true);
    expect(isTimedControl('rapid_10_3')).toBe(true);
    expect(isTimedControl('classical')).toBe(true);
    expect(isTimedControl('unlimited')).toBe(false);
    expect(isTimedControl(undefined)).toBe(false);
  });

  it('labels controls with a safe fallback', () => {
    expect(timeControlLabel('rapid')).toBe('Rapid');
    expect(timeControlLabel('rapid_10_3')).toBe('Rapid 10+3');
    expect(timeControlLabel('classical')).toBe('Classical');
    expect(timeControlLabel('unlimited')).toBe('Unlimited');
    expect(timeControlLabel('blitz')).toBe('Unlimited');
  });

  it('describes controls, without inventing one for unknown ids', () => {
    expect(timeControlDescription('rapid_10_3')).toBe('10 min + 3s per move');
    expect(timeControlDescription('classical')).toBe('30 minutes each');
    expect(timeControlDescription('blitz')).toBeNull();
  });

  it('lists only the rating pools on the leaderboard', () => {
    expect(RATING_POOLS.map((p) => p.id)).toEqual([
      'unlimited',
      'rapid',
      'classical',
    ]);
  });
});

describe('formatClock', () => {
  it('formats full and partial minutes', () => {
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9000)).toBe('0:09');
    expect(formatClock(61_500)).toBe('1:02');
  });

  it('clamps negative and invalid values to 0:00', () => {
    expect(formatClock(-500)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(undefined)).toBe('0:00');
    expect(formatClock('nonsense')).toBe('0:00');
  });

  it('rounds partial seconds up so a live clock never reads 0:00 early', () => {
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(1001)).toBe('0:02');
  });
});

describe('isLowTime', () => {
  it('flags readings at or under the threshold', () => {
    expect(isLowTime(30_000)).toBe(true);
    expect(isLowTime(1)).toBe(true);
    expect(isLowTime(0)).toBe(true);
  });

  it('ignores comfortable and invalid readings', () => {
    expect(isLowTime(30_001)).toBe(false);
    expect(isLowTime(null)).toBe(false);
    expect(isLowTime(undefined)).toBe(false);
  });
});

describe('ratingPoolForControl', () => {
  it('maps each control to its rating pool', () => {
    expect(ratingPoolForControl('rapid')).toBe('rapid');
    expect(ratingPoolForControl('rapid_10_3')).toBe('rapid');
    expect(ratingPoolForControl('classical')).toBe('classical');
    expect(ratingPoolForControl('unlimited')).toBe('unlimited');
    expect(ratingPoolForControl(undefined)).toBe('unlimited');
  });
});

describe('controlRating', () => {
  it('reads the rating for the selected control pool', () => {
    const user = { elo: 1300, rapidElo: 1500, classicalElo: 1400 };
    expect(controlRating(user, 'rapid')).toBe(1500);
    expect(controlRating(user, 'rapid_10_3')).toBe(1500);
    expect(controlRating(user, 'classical')).toBe(1400);
    expect(controlRating(user, 'unlimited')).toBe(1300);
  });

  it('falls back to the untimed rating, then the default', () => {
    expect(controlRating({ elo: 1300 }, 'rapid')).toBe(1300);
    expect(controlRating({ elo: 1300 }, 'classical')).toBe(1300);
    expect(controlRating(undefined, 'rapid')).toBe(1200);
  });
});
