import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  validateSession: vi.fn().mockResolvedValue(2),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../socket/utils.js', () => ({
  userIdFromPlayerId: (pid) => {
    if (!pid || typeof pid !== 'string') return null;
    const m = pid.match(/^user_(\d+)/);
    return m ? Number(m[1]) : null;
  },
  hasValidEloPair: () => true,
}));

const START_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

import { OnlineGameKv, normalizeKvState, resetOnlineGameKvForTesting } from './onlineGameKv.js';

function createMockRedis(store = {}) {
  return {
    _store: store,
    get: vi.fn(async (key) => store[key] ?? null),
    set: vi.fn(async (key, val, opts) => { store[key] = val; }),
    del: vi.fn(async (key) => { delete store[key]; }),
  };
}

function makeGameState(overrides = {}) {
  return {
    game_id: 'GAME1', game_code: 'GAME1',
    fen: START_FEN,
    move_history: [{ san: 'e4', from: 'e2', to: 'e4' }],
    move_count: 1,
    status: 'playing',
    game_mode: 'friendly',
    white_player_id: 'user_1',
    black_player_id: 'user_2',
    white_player_name: 'Alice',
    black_player_name: 'Bob',
    white_elo: 1200,
    black_elo: 1400,
    ...overrides,
  };
}

describe('normalizeKvState', () => {
  it('returns null for null/undefined/non-object input', () => {
    expect(normalizeKvState(null)).toBeNull();
    expect(normalizeKvState(undefined)).toBeNull();
    expect(normalizeKvState('string')).toBeNull();
  });

  it('returns null when fen is missing', () => {
    expect(normalizeKvState({ move_history: [] })).toBeNull();
  });

  it('normalizes a valid state with all fields', () => {
    const state = makeGameState();
    const normalized = normalizeKvState(state);
    expect(normalized.fen).toBe(START_FEN);
    expect(normalized.move_count).toBe(1);
    expect(normalized.status).toBe('playing');
    expect(normalized.move_history).toHaveLength(1);
    expect(normalized.white_elo).toBe(1200);
    expect(normalized.black_elo).toBe(1400);
  });

  it('fills defaults for missing fields', () => {
    const normalized = normalizeKvState({ fen: 'some-fen' });
    expect(normalized.move_history).toEqual([]);
    expect(normalized.move_count).toBe(0);
    expect(normalized.status).toBe('playing');
    expect(normalized.game_mode).toBe('friendly');
    expect(normalized.white_elo).toBeNull();
    expect(normalized.black_elo).toBeNull();
  });

  it('handles move_history as JSON-encoded string entries', () => {
    const state = makeGameState({ move_history: ['{ "san": "e4" }', 'e5'] });
    const normalized = normalizeKvState(state);
    expect(normalized.move_history).toHaveLength(2);
  });
});

describe('OnlineGameKv — enabled/disabled config', () => {
  let kv;
  afterEach(() => { resetOnlineGameKvForTesting(); });

  it('is enabled when a redis instance is provided', () => {
    kv = new OnlineGameKv(createMockRedis(), 3600);
    expect(kv.enabled).toBe(true);
  });

  it('is disabled when redis is null', () => {
    kv = new OnlineGameKv(null, 3600);
    expect(kv.enabled).toBe(false);
  });

  it('get returns null when disabled', async () => {
    kv = new OnlineGameKv(null, 3600);
    expect(await kv.get('GAME1')).toBeNull();
  });

  it('set is a no-op when disabled', async () => {
    kv = new OnlineGameKv(null, 3600);
    await kv.set('GAME1', makeGameState());
    expect(kv.enabled).toBe(false);
  });

  it('del is a no-op when disabled', async () => {
    kv = new OnlineGameKv(null, 3600);
    await kv.del('GAME1');
    expect(kv.enabled).toBe(false);
  });
});

describe('OnlineGameKv — roundtrip', () => {
  let kv;
  let redis;
  beforeEach(() => {
    redis = createMockRedis();
    kv = new OnlineGameKv(redis, 3600);
  });

  it('set then get returns normalized state', async () => {
    const state = makeGameState();
    await kv.set('GAME1', state);
    const result = await kv.get('GAME1');
    expect(result).toBeTruthy();
    expect(result.fen).toBe(START_FEN);
    expect(result.move_count).toBe(1);
    expect(result.status).toBe('playing');
  });

  it('get returns null for unknown key', async () => {
    expect(await kv.get('UNKNOWN')).toBeNull();
  });

  it('del removes the key', async () => {
    await kv.set('GAME1', makeGameState());
    await kv.del('GAME1');
    expect(redis.del).toHaveBeenCalledWith('onlinegame:GAME1');
  });

  it('set calls redis with correct namespace prefix and TTL', async () => {
    await kv.set('GAME1', makeGameState());
    expect(redis.set).toHaveBeenCalledWith(
      'onlinegame:GAME1',
      expect.objectContaining({ fen: START_FEN }),
      { ex: 3600 }
    );
  });
});

describe('OnlineGameKv — TTL/key namespace', () => {
  it('uses the configured TTL', async () => {
    const redis = createMockRedis();
    const kv = new OnlineGameKv(redis, 7200);
    await kv.set('GAME1', makeGameState());
    expect(redis.set).toHaveBeenCalledWith(
      'onlinegame:GAME1',
      expect.anything(),
      { ex: 7200 }
    );
  });

  it('uses default TTL of 4 hours when not specified', () => {
    const kv = new OnlineGameKv(createMockRedis());
    expect(kv._ttl).toBe(4 * 60 * 60);
  });

  it('keys are namespaced with onlinegame: prefix', async () => {
    const redis = createMockRedis();
    const kv = new OnlineGameKv(redis, 3600);
    await kv.set('ABC123', makeGameState({ game_id: 'ABC123', game_code: 'ABC123' }));
    expect(redis.set).toHaveBeenCalledWith(
      'onlinegame:ABC123',
      expect.anything(),
      { ex: 3600 }
    );
    await kv.get('ABC123');
    expect(redis.get).toHaveBeenCalledWith('onlinegame:ABC123');
  });
});

describe('OnlineGameKv — outage/exception fallback', () => {
  it('get returns null on redis error (non-fatal)', async () => {
    const redis = createMockRedis();
    redis.get.mockRejectedValueOnce(new Error('ECONNRESET'));
    const kv = new OnlineGameKv(redis, 3600);
    const result = await kv.get('GAME1');
    expect(result).toBeNull();
  });

  it('set does not throw on redis error (non-fatal)', async () => {
    const redis = createMockRedis();
    redis.set.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const kv = new OnlineGameKv(redis, 3600);
    await expect(kv.set('GAME1', makeGameState())).resolves.toBeUndefined();
  });

  it('del does not throw on redis error (non-fatal)', async () => {
    const redis = createMockRedis();
    redis.del.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const kv = new OnlineGameKv(redis, 3600);
    await expect(kv.del('GAME1')).resolves.toBeUndefined();
  });
});

describe('OnlineGameKv — set guards', () => {
  it('skips set for null gameCode', async () => {
    const redis = createMockRedis();
    const kv = new OnlineGameKv(redis, 3600);
    await kv.set(null, makeGameState());
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('skips set for null state', async () => {
    const redis = createMockRedis();
    const kv = new OnlineGameKv(redis, 3600);
    await kv.set('GAME1', null);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('skips set when state normalizes to null (no fen)', async () => {
    const redis = createMockRedis();
    const kv = new OnlineGameKv(redis, 3600);
    await kv.set('GAME1', { move_history: [] });
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe('OnlineGameKv — get returns null for empty gameCode', () => {
  it('returns null for empty string', async () => {
    const kv = new OnlineGameKv(createMockRedis(), 3600);
    expect(await kv.get('')).toBeNull();
  });
});
