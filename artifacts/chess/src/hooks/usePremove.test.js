import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePremove } from './usePremove';

describe('usePremove', () => {
  it('queues a normalized premove and clears it', () => {
    const { result } = renderHook(() => usePremove({ enabled: true, resetKey: 'g1' }));

    act(() => {
      result.current.queuePremove('e2', 'e4');
    });
    expect(result.current.premove).toEqual({ from: 'e2', to: 'e4', promotion: 'q' });

    act(() => {
      result.current.clearPremove();
    });
    expect(result.current.premove).toBeNull();
  });

  it('rejects a malformed premove', () => {
    const { result } = renderHook(() => usePremove({ enabled: true, resetKey: 'g1' }));

    let queued;
    act(() => {
      queued = result.current.queuePremove('e2', 'e2');
    });
    expect(queued).toBe(false);
    expect(result.current.premove).toBeNull();
  });

  it('clears the queued premove when premoves are disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => usePremove({ enabled, resetKey: 'g1' }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      result.current.queuePremove('e2', 'e4');
    });
    expect(result.current.premove).not.toBeNull();

    rerender({ enabled: false });
    expect(result.current.premove).toBeNull();
  });

  it('clears the queued premove when the board resets', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => usePremove({ enabled: true, resetKey }),
      { initialProps: { resetKey: 'g1' } },
    );

    act(() => {
      result.current.queuePremove('e2', 'e4');
    });
    expect(result.current.premove).not.toBeNull();

    rerender({ resetKey: 'g2' });
    expect(result.current.premove).toBeNull();
  });
});