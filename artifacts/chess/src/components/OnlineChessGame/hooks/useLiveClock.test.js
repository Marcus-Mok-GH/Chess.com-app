import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveClock } from './useLiveClock';

const START = new Date('2026-09-29T12:00:00.000Z').getTime();

function rapidClock(overrides = {}) {
  return {
    timeControl: 'rapid',
    status: 'playing',
    whiteMs: 600_000,
    blackMs: 600_000,
    side: 'white',
    receivedAt: START,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveClock', () => {
  it('reports no clock for untimed games', () => {
    const { result } = renderHook(() =>
      useLiveClock(rapidClock({ timeControl: 'unlimited' })),
    );
    expect(result.current.limited).toBe(false);
    expect(result.current.whiteMs).toBeNull();
    expect(result.current.blackMs).toBeNull();
    expect(result.current.flagged).toBeNull();
  });

  it('counts down the side to move as time passes', () => {
    const { result } = renderHook(() => useLiveClock(rapidClock()));

    expect(result.current.whiteMs).toBe(600_000);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(result.current.whiteMs).toBeLessThanOrEqual(597_000);
    expect(result.current.whiteMs).toBeGreaterThan(596_000);
  });

  it('leaves the waiting side untouched', () => {
    const { result } = renderHook(() => useLiveClock(rapidClock()));

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.blackMs).toBe(600_000);
  });

  it('does not tick before the game starts', () => {
    const { result } = renderHook(() =>
      useLiveClock(rapidClock({ status: 'waiting', side: 'white' })),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.whiteMs).toBe(600_000);
    expect(result.current.flagged).toBeNull();
  });

  it('flags the side to move once its time is gone', () => {
    const { result } = renderHook(() =>
      useLiveClock(rapidClock({ whiteMs: 1_000 })),
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.whiteMs).toBe(0);
    expect(result.current.flagged).toBe('white');
  });

  it('never flags the side that is not to move', () => {
    const { result } = renderHook(() =>
      useLiveClock(rapidClock({ blackMs: 0, side: 'white' })),
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current.flagged).toBeNull();
    expect(result.current.blackMs).toBe(0);
  });

  it('resynchronises when a fresh server payload arrives', () => {
    const { result, rerender } = renderHook(
      ({ clock }) => useLiveClock(clock),
      { initialProps: { clock: rapidClock() } },
    );

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    const afterTick = result.current.whiteMs;

    // A new poll reports the server's authoritative remaining time.
    rerender({
      clock: rapidClock({
        whiteMs: 500_000,
        receivedAt: START + 3_000,
      }),
    });

    expect(result.current.whiteMs).toBe(500_000);
    expect(result.current.whiteMs).toBeLessThan(afterTick);
  });
});
