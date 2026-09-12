import { Redis } from '@upstash/redis';
import { resolveRedisConfig } from '../kv/onlineGameKv.js';

const KEY_PREFIX = 'presence:';
const DEFAULT_TTL_SECONDS = 90;
const FALLBACK_TTL_MS = DEFAULT_TTL_SECONDS * 1000;

// KV-backed presence store with an in-memory Map fallback so local development
// keeps working when no Upstash Redis credentials are configured.
const inMemory = new Map(); // userId -> { username, lastActiveAt }

function buildKey(userId) {
  return `${KEY_PREFIX}${userId}`;
}

function normalizePresence(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.lastActiveAt !== 'string' || !raw.lastActiveAt) return null;
  return {
    username: typeof raw.username === 'string' ? raw.username : '',
    lastActiveAt: raw.lastActiveAt,
  };
}

export class PresenceStore {
  constructor(redis, ttlSeconds) {
    this._redis = redis || null;
    this._ttl = typeof ttlSeconds === 'number' ? ttlSeconds : DEFAULT_TTL_SECONDS;
  }

  get enabled() {
    return this._redis !== null;
  }

  async markActive(userId, username = '') {
    if (!userId) return;
    const entry = {
      username: String(username || ''),
      lastActiveAt: new Date().toISOString(),
    };
    if (this.enabled) {
      try {
        await this._redis.set(buildKey(userId), entry, { ex: this._ttl });
      } catch (err) {
        console.error('[Presence] markActive failed (non-fatal):', err?.message);
        inMemory.set(String(userId), entry);
      }
    } else {
      inMemory.set(String(userId), entry);
    }
  }

  async isOnline(userId) {
    if (!userId) return false;
    if (this.enabled) {
      try {
        const raw = await this._redis.get(buildKey(userId));
        return Boolean(normalizePresence(raw));
      } catch (err) {
        console.error('[Presence] isOnline failed (non-fatal):', err?.message);
        return this._isOnlineInMemory(userId);
      }
    }
    return this._isOnlineInMemory(userId);
  }

  async listOnline(userIds = []) {
    const online = [];
    for (const userId of userIds) {
      if (userId && (await this.isOnline(userId))) online.push(String(userId));
    }
    return online;
  }

  _isOnlineInMemory(userId) {
    const entry = inMemory.get(String(userId));
    if (!entry) return false;
    try {
      if (Date.now() - new Date(entry.lastActiveAt).getTime() < FALLBACK_TTL_MS) return true;
    } catch {
      // fall through to expiry below
    }
    inMemory.delete(String(userId));
    return false;
  }
}

let _defaultInstance = null;

export function getPresenceStore() {
  if (_defaultInstance) return _defaultInstance;
  const { url, token } = resolveRedisConfig();
  if (url && token) {
    _defaultInstance = new PresenceStore(new Redis({ url, token }));
  } else {
    _defaultInstance = new PresenceStore(null);
  }
  return _defaultInstance;
}

export function resetPresenceStoreForTesting() {
  _defaultInstance = null;
  inMemory.clear();
}

// Re-exported helpers mirroring the previous in-memory presence API so the
// social routes and any other consumers keep the same call shape.
export const markActive = (userId, username) => getPresenceStore().markActive(userId, username);

export function isOnline(userId) {
  return getPresenceStore().isOnline(userId);
}

export const listOnline = (userIds) => getPresenceStore().listOnline(userIds);