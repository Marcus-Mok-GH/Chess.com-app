import { describe, it, expect } from 'vitest';
import {
  RAPID_MS,
  CLASSICAL_MS,
  RAPID_INCREMENT_MS,
  normalizeTimeControl,
  isTimedControl,
  initialClockMs,
  incrementMsFor,
  evaluateClock,
  applyMoveToClock,
  sideToMoveFromFen,
  opponentOf,
} from './chessClock.js';

const WHITE_TO_MOVE_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

function rapidRow(overrides = {}) {
  return {
    time_control: 'rapid',
    status: 'playing',
    fen: WHITE_TO_MOVE_FEN,
    white_time_ms: RAPID_MS,
    black_time_ms: RAPID_MS,
    clock_running_since: new Date(1000),
    ...overrides,
  };
}

describe('normalizeTimeControl', () => {
  it('accepts known controls', () => {
    expect(normalizeTimeControl('rapid')).toBe('rapid');
    expect(normalizeTimeControl('rapid_10_3')).toBe('rapid_10_3');
    expect(normalizeTimeControl('classical')).toBe('classical');
    expect(normalizeTimeControl('unlimited')).toBe('unlimited');
  });

  it('falls back to unlimited for unknown or missing values', () => {
    expect(normalizeTimeControl(undefined)).toBe('unlimited');
    expect(normalizeTimeControl('blitz')).toBe('unlimited');
    expect(normalizeTimeControl(null)).toBe('unlimited');
    expect(normalizeTimeControl(42)).toBe('unlimited');
  });
});

describe('initialClockMs / isTimedControl / incrementMsFor', () => {
  it('starts the rapid variants at ten minutes and classical at thirty', () => {
    expect(initialClockMs('rapid')).toBe(10 * 60 * 1000);
    expect(initialClockMs('rapid_10_3')).toBe(10 * 60 * 1000);
    expect(initialClockMs('classical')).toBe(30 * 60 * 1000);
    expect(initialClockMs('classical')).toBe(CLASSICAL_MS);
    expect(initialClockMs('unlimited')).toBeNull();
    expect(initialClockMs(undefined)).toBeNull();
    expect(initialClockMs('blitz')).toBeNull();
  });

  it('treats both rapid variants and classical as timed', () => {
    expect(isTimedControl('rapid')).toBe(true);
    expect(isTimedControl('rapid_10_3')).toBe(true);
    expect(isTimedControl('classical')).toBe(true);
    expect(isTimedControl('unlimited')).toBe(false);
    expect(isTimedControl(undefined)).toBe(false);
  });

  it('gives only rapid 10+3 a per-move increment', () => {
    expect(incrementMsFor('rapid_10_3')).toBe(RAPID_INCREMENT_MS);
    expect(incrementMsFor('rapid')).toBe(0);
    expect(incrementMsFor('classical')).toBe(0);
    expect(incrementMsFor('unlimited')).toBe(0);
  });
});

describe('sideToMoveFromFen / opponentOf', () => {
  it('reads the side to move', () => {
    expect(sideToMoveFromFen(WHITE_TO_MOVE_FEN)).toBe('white');
    expect(sideToMoveFromFen(BLACK_TO_MOVE_FEN)).toBe('black');
    expect(sideToMoveFromFen(null)).toBe('white');
  });

  it('maps a color to its opponent', () => {
    expect(opponentOf('white')).toBe('black');
    expect(opponentOf('black')).toBe('white');
  });
});

describe('evaluateClock', () => {
  it('reports no clock for untimed games', () => {
    const clock = evaluateClock({ ...rapidRow(), time_control: 'unlimited' });
    expect(clock.limited).toBe(false);
    expect(clock.whiteMs).toBeNull();
    expect(clock.flagged).toBeNull();
  });

  it('deducts elapsed time from the side to move only', () => {
    // 30s have passed while White is on move.
    const clock = evaluateClock(rapidRow(), 1000 + 30_000);
    expect(clock.whiteMs).toBe(RAPID_MS - 30_000);
    expect(clock.blackMs).toBe(RAPID_MS);
    expect(clock.flagged).toBeNull();
  });

  it('does not tick before the clock has started', () => {
    const clock = evaluateClock(
      rapidRow({ clock_running_since: null }),
      10_000_000,
    );
    expect(clock.whiteMs).toBe(RAPID_MS);
    expect(clock.blackMs).toBe(RAPID_MS);
    expect(clock.flagged).toBeNull();
  });

  it('does not tick while the game is waiting for an opponent', () => {
    const clock = evaluateClock(
      rapidRow({ status: 'waiting' }),
      1000 + 60_000,
    );
    expect(clock.whiteMs).toBe(RAPID_MS);
    expect(clock.flagged).toBeNull();
  });

  it('flags the side to move whose time reached zero', () => {
    const clock = evaluateClock(rapidRow(), 1000 + RAPID_MS);
    expect(clock.whiteMs).toBe(0);
    expect(clock.flagged).toBe('white');
  });

  it('never flags the side that is not to move', () => {
    const clock = evaluateClock(
      rapidRow({
        fen: BLACK_TO_MOVE_FEN,
        black_time_ms: 500,
      }),
      1000 + RAPID_MS,
    );
    expect(clock.flagged).toBe('black');
    expect(clock.whiteMs).toBe(RAPID_MS);
  });

  it('does not flag an already-ended game', () => {
    const clock = evaluateClock(rapidRow({ status: 'ended' }), 1000 + RAPID_MS);
    expect(clock.flagged).toBeNull();
  });
});

describe('applyMoveToClock', () => {
  it('bakes elapsed time into the mover and hands the clock over', () => {
    const result = applyMoveToClock(rapidRow(), 'white', 1000 + 5_000);
    expect(result.flagged).toBeNull();
    expect(result.whiteMs).toBe(RAPID_MS - 5_000);
    expect(result.blackMs).toBe(RAPID_MS);
    expect(result.runningSince).toEqual(new Date(1000 + 5_000));
  });

  it('adds the Fischer increment to the mover only (rapid 10+3)', () => {
    const result = applyMoveToClock(
      rapidRow({ time_control: 'rapid_10_3' }),
      'white',
      1000 + 5_000,
    );
    expect(result.whiteMs).toBe(RAPID_MS - 5_000 + RAPID_INCREMENT_MS);
    expect(result.blackMs).toBe(RAPID_MS);
  });

  it('credits the increment to the side that moved (black)', () => {
    const result = applyMoveToClock(
      rapidRow({ time_control: 'rapid_10_3', fen: BLACK_TO_MOVE_FEN }),
      'black',
      1000 + 2_000,
    );
    expect(result.blackMs).toBe(RAPID_MS - 2_000 + RAPID_INCREMENT_MS);
    expect(result.whiteMs).toBe(RAPID_MS);
  });

  it('still flags the mover before an increment can apply', () => {
    const result = applyMoveToClock(
      rapidRow({ time_control: 'rapid_10_3' }),
      'white',
      1000 + RAPID_MS + 1,
    );
    expect(result).toEqual({ flagged: 'white' });
  });

  it('refuses the move and reports the flag when the mover ran out', () => {
    const result = applyMoveToClock(rapidRow(), 'white', 1000 + RAPID_MS + 1);
    expect(result).toEqual({ flagged: 'white' });
  });

  it('leaves everything null for untimed games', () => {
    const result = applyMoveToClock(
      { ...rapidRow(), time_control: 'unlimited' },
      'white',
      1000 + 5_000,
    );
    expect(result).toEqual({
      flagged: null,
      whiteMs: null,
      blackMs: null,
      runningSince: null,
    });
  });
});
