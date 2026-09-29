/**
 * Floating reaction bursts over the online game board.
 *
 * Reactions arrive as regular chat messages (plain words like "SWEAT") through
 * the throttled chat poll. Pure helpers here make the burst lifecycle
 * testable: given the previous and next message lists, decide which reactions
 * should burst. The component owns expiry via render timestamps.
 */

import { reactionEmoji } from './onlineReactions';

/** How long a burst stays visible on the board, in milliseconds. */
export const REACTION_BURST_MS = 1800;

/**
 * Returns the reaction messages that are new in `next` compared to `prev`,
 * in oldest-first order.
 *
 * Detection is by message id when present (polls fetch the same rows
 * repeatedly, so content comparison alone would re-burst old messages every
 * tick), falling back to a stable identity of sender + body + timestamp.
 */
export function findNewReactionMessages(prev, next) {
  const seen = new Set(
    (Array.isArray(prev) ? prev : []).map(messageKey),
  );
  return (Array.isArray(next) ? next : []).filter((m) => {
    const emoji = reactionEmoji(m?.message ?? m?.body);
    if (!emoji) return false;
    return !seen.has(messageKey(m));
  });
}

function messageKey(m) {
  if (m?.id != null) return `id:${m.id}`;
  return `${m?.playerId ?? m?.userId ?? ''}|${m?.message ?? m?.body ?? ''}|${m?.timestamp ?? ''}`;
}

/**
 * Builds a burst descriptor for rendering: a unique render id, the emoji to
 * show, whether the reaction came from the local player, and a random
 * horizontal offset (percentage of board width) around the board center so
 * simultaneous bursts do not stack into one column.
 */
export function makeBurst(message, emoji, { mine = false, now = Date.now() } = {}) {
  const offsetPct = 12 + Math.round(Math.random() * 26); // 12%–38% from center
  return {
    id: `burst-${now}-${Math.random().toString(36).slice(2, 8)}`,
    emoji,
    mine,
    offsetPct,
    createdAt: now,
  };
}

/** Filters out bursts older than REACTION_BURST_MS. */
export function pruneBursts(bursts, now = Date.now()) {
  return (Array.isArray(bursts) ? bursts : []).filter(
    (b) => now - b.createdAt < REACTION_BURST_MS,
  );
}
