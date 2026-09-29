import { normalizeTimeControl } from './chessClock.js';

/**
 * Per-time-control Elo pools.
 *
 * A user's rating is tracked separately for each control, so a result in one
 * pool never moves the other. `users.elo` is the original column and remains
 * the untimed/unlimited rating; `users.rapid_elo` is the rapid pool. Unknown or
 * missing controls normalize to unlimited, matching the clock and queue logic.
 */
export const RATING_COLUMN_BY_CONTROL = Object.freeze({
  unlimited: 'elo',
  rapid: 'rapid_elo',
});

export const DEFAULT_RATING = 1200;
export const MIN_RATING = 100;
export const MAX_RATING = 4000;

/** The `users` column that stores the rating for a time control. */
export function ratingColumnFor(timeControl) {
  return RATING_COLUMN_BY_CONTROL[normalizeTimeControl(timeControl)] ?? 'elo';
}

/**
 * Reads the rating for a control out of a user (or queue) row and clamps it to
 * the valid range. A missing/garbage value falls back to the default rating so
 * a bad row can never seed a game with a nonsense rating.
 */
export function ratingForControl(row, timeControl) {
  const column = ratingColumnFor(timeControl);
  const value = Number(row?.[column]);
  if (!Number.isFinite(value)) return DEFAULT_RATING;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(value)));
}
