import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DrawOfferKv,
  getDrawOfferKv,
  resetDrawOfferKvForTesting,
  DRAW_OFFER_STORAGE_ERROR,
} from './drawOfferKv.js';

function createMockRedis(store = {}) {
  return {
    _store: store,
    get: vi.fn(async (key) => store[key] ?? null),
    set: vi.fn(async (key, val, opts) => {
      if (opts?.nx && key in store) return null;
      store[key] = val;
      return 'OK';
    }),
    del: vi.fn(async (key) => { delete store[key]; }),
    getdel: vi.fn(async (key) => {
      const val = store[key] ?? null;
      delete store[key];
      return val;
    }),
  };
}

function makeOffer(overrides = {}) {
  return {
    offeredBy: 'user_1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  resetDrawOfferKvForTesting();
});

describe('DrawOfferKv.set', () => {
  it('returns true and stores in memory when redis is not configured', async () => {
    const kv = new DrawOfferKv(null, 3600);
    expect(kv.enabled).toBe(false);

    await expect(kv.set('GAME1', makeOffer())).resolves.toBe(true);
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_1' });
  });

  it('returns true when a configured redis write succeeds', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);
    await expect(kv.set('GAME1', makeOffer())).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith('drawoffer:GAME1', expect.anything(), { ex: 3600 });
  });

  it('returns false and does not fall back to memory when a configured redis write fails', async () => {
    const redis = createMockRedis();
    redis.set.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const kv = new DrawOfferKv(redis, 3600);

    await expect(kv.set('GAME1', makeOffer())).resolves.toBe(false);
    expect(await kv.get('GAME1')).toBeNull();
  });

  it('returns false for invalid input', async () => {
    const kv = new DrawOfferKv(null, 3600);
    await expect(kv.set('GAME1', { offeredBy: 123 })).resolves.toBe(false);
  });
});

describe('DrawOfferKv.createIfAbsent', () => {
  it('creates an offer when none exists and returns null', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);

    await expect(kv.createIfAbsent('GAME1', makeOffer())).resolves.toBeNull();
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_1' });
  });

  it('returns the existing offer without overwriting it', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);
    await kv.set('GAME1', makeOffer({ offeredBy: 'user_2' }));

    const existing = await kv.createIfAbsent('GAME1', makeOffer({ offeredBy: 'user_1' }));
    expect(existing).toMatchObject({ offeredBy: 'user_2' });
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_2' });
  });

  it('returns DRAW_OFFER_STORAGE_ERROR when a configured redis write fails', async () => {
    const redis = createMockRedis();
    redis.set.mockRejectedValueOnce(new Error('ECONNRESET'));
    const kv = new DrawOfferKv(redis, 3600);

    const result = await kv.createIfAbsent('GAME1', makeOffer());
    expect(result).toBe(DRAW_OFFER_STORAGE_ERROR);
  });

  it('guards the in-memory path so an existing offer is not overwritten', async () => {
    const kv = new DrawOfferKv(null, 3600);
    await kv.set('GAME1', makeOffer({ offeredBy: 'user_2' }));

    const existing = await kv.createIfAbsent('GAME1', makeOffer({ offeredBy: 'user_1' }));
    expect(existing).toMatchObject({ offeredBy: 'user_2' });
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_2' });
  });
});

describe('DrawOfferKv.consumeIfMatches', () => {
  it('consumes the offer and returns it when it matches', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);
    await kv.set('GAME1', makeOffer({ offeredBy: 'user_2' }));

    const consumed = await kv.consumeIfMatches('GAME1', 'user_2');
    expect(consumed).toMatchObject({ offeredBy: 'user_2' });
    await expect(kv.get('GAME1')).resolves.toBeNull();
  });

  it('returns null and leaves the offer when it does not match', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);
    await kv.set('GAME1', makeOffer({ offeredBy: 'user_2' }));

    await expect(kv.consumeIfMatches('GAME1', 'user_1')).resolves.toBeNull();
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_2' });
  });

  it('returns null when no offer exists', async () => {
    const redis = createMockRedis();
    const kv = new DrawOfferKv(redis, 3600);
    await expect(kv.consumeIfMatches('GAME1', 'user_1')).resolves.toBeNull();
  });

  it('consumes only a matching offer in the in-memory path', async () => {
    const kv = new DrawOfferKv(null, 3600);
    await kv.set('GAME1', makeOffer({ offeredBy: 'user_2' }));

    await expect(kv.consumeIfMatches('GAME1', 'user_1')).resolves.toBeNull();
    expect(await kv.get('GAME1')).toMatchObject({ offeredBy: 'user_2' });

    const consumed = await kv.consumeIfMatches('GAME1', 'user_2');
    expect(consumed).toMatchObject({ offeredBy: 'user_2' });
    await expect(kv.get('GAME1')).resolves.toBeNull();
  });
});

describe('getDrawOfferKv — configuration', () => {
  it('returns a disabled instance when no REST KV credentials are configured', () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    expect(getDrawOfferKv().enabled).toBe(false);
    vi.unstubAllEnvs();
  });
});