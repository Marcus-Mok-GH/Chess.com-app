import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PresenceStore, resetPresenceStoreForTesting } from './presenceService.js';

const TTL_SECONDS = 90;

function createMockRedis() {
  const store = new Map();
  return {
    _store: store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key, val) => { store.set(key, val); }),
    del: vi.fn(async (key) => { store.delete(key); }),
  };
}

describe('PresenceStore', () => {
  beforeEach(() => {
    resetPresenceStoreForTesting();
  });

  afterEach(() => {
    resetPresenceStoreForTesting();
  });

  it('falls back to memory when no Redis is configured', async () => {
    const store = new PresenceStore(null, TTL_SECONDS);
    expect(store.enabled).toBe(false);

    await store.markActive('user1', 'alice');
    expect(await store.isOnline('user1')).toBe(true);
    expect(await store.isOnline('user2')).toBe(false);
  });

  it('marks a user online and stores them in Redis when configured', async () => {
    const redis = createMockRedis();
    const store = new PresenceStore(redis, TTL_SECONDS);
    expect(store.enabled).toBe(true);

    await store.markActive('user1', 'alice');
    expect(await store.isOnline('user1')).toBe(true);
    expect(await store.isOnline('user2')).toBe(false);

    expect(redis.set).toHaveBeenCalledWith(
      'presence:user1',
      expect.objectContaining({ username: 'alice', lastActiveAt: expect.any(String) }),
      { ex: TTL_SECONDS }
    );
  });

  it('treats an expired in-memory entry as offline', async () => {
    const store = new PresenceStore(null, TTL_SECONDS);
    await store.markActive('user1', 'alice');
    expect(store._isOnlineInMemory('user1')).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 200_000); // past the 90s fallback TTL
    expect(store._isOnlineInMemory('user1')).toBe(false);
    vi.useRealTimers();
  });

  it('reports online from memory when Redis set failed and a later GET returns null', async () => {
    const redis = createMockRedis();
    redis.set.mockRejectedValueOnce(new Error('redis unavailable'));
    redis.get.mockResolvedValue(null);
    const store = new PresenceStore(redis, TTL_SECONDS);

    await store.markActive('user1', 'alice');
    expect(await store.isOnline('user1')).toBe(true);
  });

  it('prefers a valid Redis entry over the in-memory fallback', async () => {
    const redis = createMockRedis();
    const store = new PresenceStore(redis, TTL_SECONDS);
    await store.markActive('user1', 'alice');
    expect(await store.isOnline('user1')).toBe(true);
    expect(redis.get).toHaveBeenCalledWith('presence:user1');
  });

  it('lists only online members', async () => {
    const store = new PresenceStore(null, TTL_SECONDS);
    await store.markActive('u1', 'a');
    await store.markActive('u2', 'b');

    const online = await store.listOnline(['u1', 'u2', 'u3']);
    expect(online.sort()).toEqual(['u1', 'u2']);
  });
});