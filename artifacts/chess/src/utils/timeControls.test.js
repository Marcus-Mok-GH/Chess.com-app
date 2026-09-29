import { describe, it, expect } from 'vitest';
import {
  RAPID_MS,
  TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  initialClockMs,
  formatClock,
  timeControlLabel,
  isLowTime,
  controlRating,
} from './timeControls';

describe('timeControls', () => {
  it('exposes unlimited and rapid with server-matching ids', () => {
    expect(TIME_CONTROLS.map((t) => t.id)).toEqual(['unlimited', 'rapid']);
    expect(DEFAULT_TIME_CONTROL).toBe('unlimited');
  });

  it('starts rapid at ten minutes and untimed at null', () => {
    expect(initialClockMs('rapid')).toBe(RAPID_MS);
    expect(initialClockMs('unlimited')).toBeNull();
    expect(initialClockMs(undefined)).toBeNull();
  });

  it('labels controls with a safe fallback', () => {
    expect(timeControlLabel('rapid')).toBe('Rapid');
    expect(timeControlLabel('unlimited')).toBe('Unlimited');
    expect(timeControlLabel('blitz')).toBe('Unlimited');
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

describe('controlRating', () => {
  it('reads the rating for the selected control pool', () => {
    const user = { elo: 1300, rapidElo: 1500 };
    expect(controlRating(user, 'rapid')).toBe(1500);
    expect(controlRating(user, 'unlimited')).toBe(1300);
  });

  it('falls back to the untimed rating, then the default', () => {
    expect(controlRating({ elo: 1300 }, 'rapid')).toBe(1300);
    expect(controlRating(undefined, 'rapid')).toBe(1200);
  });
});
