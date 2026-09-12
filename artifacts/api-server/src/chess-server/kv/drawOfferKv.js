import { Redis } from '@upstash/redis';
import { resolveRedisConfig } from './onlineGameKv.js';

const KEY_PREFIX = 'drawoffer:';
const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes
const FALLBACK_TTL_MS = DEFAULT_TTL_SECONDS * 1000;

// Sentinel returned by createIfAbsent when a configured Redis write fails. The
// caller must surface it as an error instead of reporting the offer as stored.
export const DRAW_OFFER_STORAGE_ERROR = Symbol('DRAW_OFFER_STORAGE_ERROR');

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

  // Returns true when the write was recorded. When Redis is configured but the
  // write fails, no in-memory fallback is used (a poll from another instance
  // would miss it) and false is returned so the caller can surface the failure.
  async set(gameId, offer) {
    if (!gameId || !offer || typeof offer.offeredBy !== 'string') return false;
    const normalized = { offeredBy: offer.offeredBy, createdAt: offer.createdAt || new Date().toISOString() };
    if (this.enabled) {
      try {
        await this._redis.set(buildKey(gameId), normalized, { ex: this._ttl });
        return true;
      } catch (err) {
        console.error('[DrawOfferKv] set failed:', err?.message);
        return false;
      }
    }
    inMemory.set(String(gameId), normalized);
    return true;
  }

  // Atomically create an offer only if none exists. Returns null when the offer
  // was created, the existing offer when one is already present, or
  // DRAW_OFFER_STORAGE_ERROR when a configured Redis write fails.
  async createIfAbsent(gameId, offer) {
    if (!gameId || !offer || typeof offer.offeredBy !== 'string') return null;
    const normalized = { offeredBy: offer.offeredBy, createdAt: offer.createdAt || new Date().toISOString() };
    if (this.enabled) {
      try {
        const added = await this._redis.set(buildKey(gameId), normalized, { ex: this._ttl, nx: true });
        if (added) return null;
        return normalizeOffer(await this._redis.get(buildKey(gameId))) || normalized;
      } catch (err) {
        console.error('[DrawOfferKv] createIfAbsent failed:', err?.message);
        return DRAW_OFFER_STORAGE_ERROR;
      }
    }
    const existing = this._getFromMemory(gameId);
    if (existing) return existing;
    inMemory.set(String(gameId), normalized);
    return null;
  }

  // Atomically consume (delete) an offer, but only when it still carries the
  // expected offeredBy. Returns the consumed offer, or null when there is no
  // offer or the stored offer no longer matches (and is left untouched). A
  // Redis mismatch is the result of a concurrent reply racing this one; the
  // stored offer is restored so only the verified caller consumes it.
  async consumeIfMatches(gameId, expectedOfferedBy) {
    if (!gameId) return null;
    if (this.enabled) {
      try {
        const offer = normalizeOffer(await this._redis.getdel(buildKey(gameId)));
        if (!offer) return null;
        if (offer.offeredBy === expectedOfferedBy) return offer;
        await this._redis.set(buildKey(gameId), offer, { ex: this._ttl });
        return null;
      } catch (err) {
        console.error('[DrawOfferKv] consumeIfMatches failed:', err?.message);
        return null;
      }
    }
    const offer = this._getFromMemory(gameId);
    if (!offer || offer.offeredBy !== expectedOfferedBy) return null;
    inMemory.delete(String(gameId));
    return offer;
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