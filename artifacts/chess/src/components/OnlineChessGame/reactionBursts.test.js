import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REACTION_BURST_MS,
  findNewReactionMessages,
  makeBurst,
  pruneBursts,
} from './reactionBursts';
import { REACTIONS } from './onlineReactions';

describe('findNewReactionMessages', () => {
  it('detects bare reaction words only', () => {
    const next = [
      { id: 1, message: 'SWEAT' },
      { id: 2, message: 'good luck, have fun' },
      { id: 3, message: 'WOW' },
      { id: 4, message: 'that SWEAT was loud' },
    ];
    const fresh = findNewReactionMessages([], next);
    expect(fresh.map((m) => m.id)).toEqual([1, 3]);
  });

  it('does not re-burst messages seen in the previous poll (by id)', () => {
    const messages = [
      { id: 1, message: 'SWEAT' },
      { id: 2, message: 'PARTY' },
    ];
    expect(findNewReactionMessages(messages, messages)).toEqual([]);
  });

  it('falls back to player+body+timestamp identity when ids are absent', () => {
    const messages = [
      { playerId: 'p1', message: 'SWEAT', timestamp: '2026-09-29T10:00:00Z' },
    ];
    expect(findNewReactionMessages(messages, messages)).toEqual([]);
    expect(
      findNewReactionMessages(
        [],
        [{ playerId: 'p2', message: 'SWEAT', timestamp: '2026-09-29T10:00:00Z' }],
      ),
    ).toHaveLength(1);
  });

  it('is case-insensitive and supports both message and body fields', () => {
    expect(findNewReactionMessages([], [{ body: 'party' }])).toHaveLength(1);
    expect(findNewReactionMessages([], [{ message: 'party' }])).toHaveLength(1);
  });

  it('handles null/undefined inputs', () => {
    expect(findNewReactionMessages(null, null)).toEqual([]);
  });
});

describe('makeBurst', () => {
  it('builds a unique burst with the right emoji and side', () => {
    const a = makeBurst({}, REACTIONS[0].emoji, { mine: true, now: 1000 });
    const b = makeBurst({}, REACTIONS[0].emoji, { mine: true, now: 1000 });
    expect(a.emoji).toBe('👍');
    expect(a.mine).toBe(true);
    expect(a.createdAt).toBe(1000);
    expect(a.id).not.toBe(b.id);
  });

  it('keeps horizontal offsets within the board', () => {
    for (let i = 0; i < 50; i++) {
      const burst = makeBurst({}, '😅', { now: i });
      expect(burst.offsetPct).toBeGreaterThanOrEqual(12);
      expect(burst.offsetPct).toBeLessThanOrEqual(38);
    }
  });
});

describe('pruneBursts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops bursts past their lifetime and keeps fresh ones', () => {
    const now = 10_000;
    const bursts = [
      { id: 'a', createdAt: now - REACTION_BURST_MS }, // exactly expired
      { id: 'b', createdAt: now - REACTION_BURST_MS + 1 }, // 1ms left
      { id: 'c', createdAt: now - REACTION_BURST_MS - 1 }, // 1ms over
    ];
    const kept = pruneBursts(bursts, now);
    expect(kept.map((b) => b.id)).toEqual(['b']);
  });

  it('tolerates null input', () => {
    expect(pruneBursts(null, 1000)).toEqual([]);
  });
});
