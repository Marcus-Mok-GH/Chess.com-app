import { Redis } from '@upstash/redis';
import { resolveRedisConfig } from './onlineGameKv.js';

const KEY_PREFIX = 'drawoffer:';
const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes
const FALLBACK_TTL_MS = DEFAULT_TTL_SECONDS * 1000;

// KV-backed draw-offer store shared by the HTTP draw-flow endpoints. Models the
// same accessor pattern as onlineGameKv, plus an in-memory Map fallback so the
// draw flow still works locally without Upstash Redis credentials.
const inMemory = new Map(); // gameId -> { offeredBy, createdAt }

function buildKey(gameId) {
  return `${KEY_PREFIX}${gameId}`;
}

function normalizeOffer(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.offeredBy !== 'string' || !raw.offeredBy) return null;
  if (typeof raw.createdAt !== 'string' || !raw.createdAt) return null;
  return { offeredBy: raw.offeredBy, createdAt: raw.createdAt };
}

export class DrawOfferKv {
  constructor(redis, ttlSeconds) {
    this._redis = redis || null;
    this._ttl = typeof ttlSeconds === 'number' ? ttlSeconds : DEFAULT_TTL_SECONDS;
  }

  get enabled() {
    return this._redis !== null;
  }

  async get(gameId) {
    if (!gameId) return null;
    if (this.enabled) {
      try {
        const raw = await this._redis.get(buildKey(gameId));
        return normalizeOffer(raw);
      } catch (err) {
        console.error('[DrawOfferKv] get failed (non-fatal):', err?.message);
        return this._getFromMemory(gameId);
      }
    }
    return this._getFromMemory(gameId);
  }

  async set(gameId, offer) {
    if (!gameId || !offer || typeof offer.offeredBy !== 'string') return;
    const normalized = { offeredBy: offer.offeredBy, createdAt: offer.createdAt || new Date().toISOString() };
    if (this.enabled) {
      try {
        await this._redis.set(buildKey(gameId), normalized, { ex: this._ttl });
      } catch (err) {
        console.error('[DrawOfferKv] set failed (non-fatal):', err?.message);
        inMemory.set(String(gameId), normalized);
      }
    } else {
      inMemory.set(String(gameId), normalized);
    }
  }

  async del(gameId) {
    if (!gameId) return;
    inMemory.delete(String(gameId));
    if (this.enabled) {
      try {
        await this._redis.del(buildKey(gameId));
      } catch (err) {
        console.error('[DrawOfferKv] del failed (non-fatal):', err?.message);
      }
    }
  }

  _getFromMemory(gameId) {
    const entry = inMemory.get(String(gameId));
    if (!entry) return null;
    try {
      if (Date.now() - new Date(entry.createdAt).getTime() < FALLBACK_TTL_MS) return entry;
    } catch {
      // fall through to expiry below
    }
    inMemory.delete(String(gameId));
    return null;
  }
}

let _defaultInstance = null;

export function getDrawOfferKv() {
  if (_defaultInstance) return _defaultInstance;
  const { url, token } = resolveRedisConfig();
  if (url && token) {
    _defaultInstance = new DrawOfferKv(new Redis({ url, token }));
  } else {
    _defaultInstance = new DrawOfferKv(null);
  }
  return _defaultInstance;
}

export function resetDrawOfferKvForTesting() {
  _defaultInstance = null;
  inMemory.clear();
}