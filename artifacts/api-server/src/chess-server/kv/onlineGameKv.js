import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'onlinegame:';
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

export function resolveRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null;
  return { url, token };
}

function buildKey(gameCode) {
  return `${KEY_PREFIX}${gameCode}`;
}

export function normalizeKvState(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const fen = typeof raw.fen === 'string' ? raw.fen : null;
  if (!fen) return null;
  return {
    fen,
    move_history: Array.isArray(raw.move_history) ? raw.move_history : [],
    move_count: typeof raw.move_count === 'number' ? raw.move_count : 0,
    status: typeof raw.status === 'string' ? raw.status : 'playing',
    game_mode: typeof raw.game_mode === 'string' ? raw.game_mode : 'friendly',
    white_player_id: raw.white_player_id || null,
    black_player_id: raw.black_player_id || null,
    white_player_name: raw.white_player_name || null,
    black_player_name: raw.black_player_name || null,
    white_elo: typeof raw.white_elo === 'number' ? raw.white_elo : null,
    black_elo: typeof raw.black_elo === 'number' ? raw.black_elo : null,
    game_id: raw.game_id || raw.game_code || null,
    game_code: raw.game_code || raw.game_id || null,
  };
}

export class OnlineGameKv {
  constructor(redis, ttlSeconds) {
    this._redis = redis || null;
    this._ttl = typeof ttlSeconds === 'number' ? ttlSeconds : DEFAULT_TTL_SECONDS;
  }

  get enabled() {
    return this._redis !== null;
  }

  async get(gameCode) {
    if (!this.enabled || !gameCode) return null;
    try {
      const raw = await this._redis.get(buildKey(gameCode));
      return normalizeKvState(raw);
    } catch (err) {
      console.error('[Kv] get failed (non-fatal):', err?.message);
      return null;
    }
  }

  async set(gameCode, state) {
    if (!this.enabled || !gameCode || !state) return;
    try {
      const normalized = normalizeKvState(state);
      if (!normalized) return;
      await this._redis.set(buildKey(gameCode), normalized, { ex: this._ttl });
    } catch (err) {
      console.error('[Kv] set failed (non-fatal):', err?.message);
    }
  }

  async del(gameCode) {
    if (!this.enabled || !gameCode) return;
    try {
      await this._redis.del(buildKey(gameCode));
    } catch (err) {
      console.error('[Kv] del failed (non-fatal):', err?.message);
    }
  }
}

let _defaultInstance = null;

export function getOnlineGameKv() {
  if (_defaultInstance) return _defaultInstance;
  const { url, token } = resolveRedisConfig();
  if (url && token) {
    const redis = new Redis({ url, token });
    _defaultInstance = new OnlineGameKv(redis);
  } else {
    _defaultInstance = new OnlineGameKv(null);
  }
  return _defaultInstance;
}

export function resetOnlineGameKvForTesting() {
  _defaultInstance = null;
}
