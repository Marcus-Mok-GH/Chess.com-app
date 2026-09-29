import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/api', () => ({
  default: {
    getNotifications: vi.fn(),
    markNotificationsRead: vi.fn(),
  },
}));

import api from '../services/api';

/** A promise plus the handle to settle it, so a fetch can be held in flight. */
function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function inbox(title) {
  return {
    notifications: [{ id: 1, title, body: title, read_at: null, payload: {} }],
    unreadCount: 1,
  };
}

let useNotifications;
let markAllNotificationsRead;

beforeEach(async () => {
  vi.clearAllMocks();
  // The store is module-level (one poll shared by both bells), so each test
  // needs a fresh module to start from an empty inbox.
  vi.resetModules();
  const module = await import('./useNotifications.js');
  useNotifications = module.useNotifications;
  markAllNotificationsRead = module.markAllNotificationsRead;
});

describe('useNotifications', () => {
  it('loads the inbox for the signed-in account', async () => {
    api.getNotifications.mockResolvedValue(inbox('Cheating confirmed in game AAA'));

    const { result } = renderHook(() => useNotifications('user-a'));
    await act(async () => {});

    expect(result.current.items).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.items[0].title).toContain('AAA');
  });

  it('stays empty when signed out and never calls the API', async () => {
    const { result } = renderHook(() => useNotifications(null));
    await act(async () => {});

    expect(api.getNotifications).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('discards an in-flight response belonging to the previous account', async () => {
    // A's request is held open, the account switches to B, and only then does
    // A's inbox arrive. It must not surface under B: these bodies name
    // opponents, games, and ratings.
    const first = deferred();
    const second = deferred();
    api.getNotifications
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ id }) => useNotifications(id), {
      initialProps: { id: 'user-a' },
    });

    rerender({ id: 'user-b' });
    await act(async () => {
      first.resolve(inbox("Alice's private notice"));
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);

    // B's own response still lands normally.
    await act(async () => {
      second.resolve(inbox("Bob's notice"));
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toContain("Bob's");
  });

  it('leaves the new account loading when a stale response is dropped', async () => {
    // The dropped response must not clear `loading`, or the guard against
    // duplicate fetches would open up while B's request is still running.
    const first = deferred();
    const second = deferred();
    api.getNotifications
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ id }) => useNotifications(id), {
      initialProps: { id: 'user-a' },
    });

    rerender({ id: 'user-b' });
    await act(async () => {
      first.resolve(inbox('stale'));
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.loaded).toBe(false);

    await act(async () => {
      second.resolve(inbox('fresh'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.loaded).toBe(true);
  });

  it('discards a stale read receipt from the previous account', async () => {
    api.getNotifications.mockResolvedValue(inbox('Bob notice'));
    const read = deferred();
    api.markNotificationsRead.mockReturnValue(read.promise);

    const { result, rerender } = renderHook(({ id }) => useNotifications(id), {
      initialProps: { id: 'user-a' },
    });
    await act(async () => {});
    expect(result.current.unreadCount).toBe(1);

    // Mark-all starts as A, the account switches, then the receipt arrives.
    let pending;
    await act(async () => { pending = markAllNotificationsRead(); });
    rerender({ id: 'user-b' });
    await act(async () => {
      read.resolve({ unreadCount: 0 });
      await pending;
    });

    // B's count came from B's own fetch, not from A's receipt.
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.items[0].read_at).toBeNull();
  });
});
