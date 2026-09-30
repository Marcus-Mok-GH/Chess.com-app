import { describe, it, expect } from 'vitest';
import {
  BULLET_MS,
  BLITZ_MS,
  RAPID_MS,
  CLASSICAL_MS,
  BLITZ_INCREMENT_MS,
  RAPID_INCREMENT_MS,
  CLASSICAL_INCREMENT_MS,
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
      'bullet',
      'blitz',
      'blitz_3_2',
      'rapid',
      'rapid_10_3',
      'classical',
      'classical_30_5',
    ]);
    expect(DEFAULT_TIME_CONTROL).toBe('unlimited');
  });

  it('starts bullet at one minute, the blitz controls at three, the rapid variants at ten, and classical at thirty', () => {
    expect(initialClockMs('bullet')).toBe(BULLET_MS);
    expect(initialClockMs('blitz')).toBe(BLITZ_MS);
    expect(initialClockMs('blitz_3_2')).toBe(BLITZ_MS);
    expect(initialClockMs('rapid')).toBe(RAPID_MS);
    expect(initialClockMs('rapid_10_3')).toBe(RAPID_MS);
    expect(initialClockMs('classical')).toBe(CLASSICAL_MS);
    expect(initialClockMs('classical_30_5')).toBe(CLASSICAL_MS);
    expect(initialClockMs('unlimited')).toBeNull();
    expect(initialClockMs(undefined)).toBeNull();
  });

  it('applies the increment only to the increment variants', () => {
    expect(incrementMsFor('bullet')).toBe(0);
    expect(incrementMsFor('blitz')).toBe(0);
    expect(incrementMsFor('blitz_3_2')).toBe(BLITZ_INCREMENT_MS);
    expect(incrementMsFor('rapid_10_3')).toBe(RAPID_INCREMENT_MS);
    expect(incrementMsFor('classical_30_5')).toBe(CLASSICAL_INCREMENT_MS);
    expect(incrementMsFor('rapid')).toBe(0);
    expect(incrementMsFor('classical')).toBe(0);
    expect(incrementMsFor('unlimited')).toBe(0);
  });

  it('treats every variant, blitz, and classical as timed', () => {
    expect(isTimedControl('bullet')).toBe(true);
    expect(isTimedControl('blitz')).toBe(true);
    expect(isTimedControl('blitz_3_2')).toBe(true);
    expect(isTimedControl('rapid')).toBe(true);
    expect(isTimedControl('rapid_10_3')).toBe(true);
    expect(isTimedControl('classical')).toBe(true);
    expect(isTimedControl('classical_30_5')).toBe(true);
    expect(isTimedControl('unlimited')).toBe(false);
    expect(isTimedControl(undefined)).toBe(false);
  });

  it('labels controls with a safe fallback', () => {
    expect(timeControlLabel('bullet')).toBe('Bullet');
    expect(timeControlLabel('blitz')).toBe('Blitz');
    expect(timeControlLabel('blitz_3_2')).toBe('Blitz 3+2');
    expect(timeControlLabel('rapid')).toBe('Rapid');
    expect(timeControlLabel('rapid_10_3')).toBe('Rapid 10+3');
    expect(timeControlLabel('classical')).toBe('Classical');
    expect(timeControlLabel('classical_30_5')).toBe('Classical 30+5');
    expect(timeControlLabel('unlimited')).toBe('Unlimited');
    expect(timeControlLabel('hyperbullet')).toBe('Unlimited');
  });

  it('describes controls, without inventing one for unknown ids', () => {
    expect(timeControlDescription('bullet')).toBe('1 minute each');
    expect(timeControlDescription('blitz')).toBe('3 minutes each');
    expect(timeControlDescription('blitz_3_2')).toBe('3 min + 2s per move');
    expect(timeControlDescription('rapid_10_3')).toBe('10 min + 3s per move');
    expect(timeControlDescription('classical')).toBe('30 minutes each');
    expect(timeControlDescription('classical_30_5')).toBe('30 min + 5s per move');
    expect(timeControlDescription('hyperbullet')).toBeNull();
  });

  it('lists only the rating pools on the leaderboard', () => {
    expect(RATING_POOLS.map((p) => p.id)).toEqual([
      'unlimited',
      'bullet',
      'blitz',
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
    expect(ratingPoolForControl('bullet')).toBe('bullet');
    expect(ratingPoolForControl('blitz')).toBe('blitz');
    expect(ratingPoolForControl('blitz_3_2')).toBe('blitz');
    expect(ratingPoolForControl('rapid')).toBe('rapid');
    expect(ratingPoolForControl('rapid_10_3')).toBe('rapid');
    expect(ratingPoolForControl('classical')).toBe('classical');
    expect(ratingPoolForControl('classical_30_5')).toBe('classical');
    expect(ratingPoolForControl('unlimited')).toBe('unlimited');
    expect(ratingPoolForControl(undefined)).toBe('unlimited');
  });
});

describe('controlRating', () => {
  it('reads the rating for the selected control pool', () => {
    const user = { elo: 1300, bulletElo: 1450, blitzElo: 1350, rapidElo: 1500, classicalElo: 1400 };
    expect(controlRating(user, 'bullet')).toBe(1450);
    expect(controlRating(user, 'blitz')).toBe(1350);
    expect(controlRating(user, 'blitz_3_2')).toBe(1350);
    expect(controlRating(user, 'rapid')).toBe(1500);
    expect(controlRating(user, 'rapid_10_3')).toBe(1500);
    expect(controlRating(user, 'classical')).toBe(1400);
    expect(controlRating(user, 'classical_30_5')).toBe(1400);
    expect(controlRating(user, 'unlimited')).toBe(1300);
  });

  it('falls back to the untimed rating, then the default', () => {
    expect(controlRating({ elo: 1300 }, 'bullet')).toBe(1300);
    expect(controlRating({ elo: 1300 }, 'blitz_3_2')).toBe(1300);
    expect(controlRating({ elo: 1300 }, 'rapid')).toBe(1300);
    expect(controlRating({ elo: 1300 }, 'classical')).toBe(1300);
    expect(controlRating(undefined, 'rapid')).toBe(1200);
  });
});
