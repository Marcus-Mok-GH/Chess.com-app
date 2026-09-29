/**
 * Time controls available for online games.
 *
 * The ids match the server's `time_control` column so the value can be sent
 * through unchanged. Rapid is 10 + 0 — a flat ten minutes per player with no
 * increment.
 */

export const RAPID_MS = 10 * 60 * 1000;

export const TIME_CONTROLS = [
  {
    id: 'unlimited',
    label: 'Unlimited',
    description: 'No clock — take as long as you like',
  },
  {
    id: 'rapid',
    label: 'Rapid',
    description: '10 minutes each',
  },
];

export const DEFAULT_TIME_CONTROL = 'unlimited';

/**
 * The rating a user plays a given control with. Each control has its own pool,
 * so Rapid reads `rapidElo` while everything else reads the untimed `elo`.
 * Falls back to the default rating for signed-out users.
 */
export function controlRating(user, timeControl) {
  if (!user) return 1200;
  if (timeControl === 'rapid') return user.rapidElo ?? user.elo ?? 1200;
  return user.elo ?? 1200;
}

/** Initial remaining time for a control, or null when untimed. */
export function initialClockMs(timeControl) {
  return timeControl === 'rapid' ? RAPID_MS : null;
}

/**
 * Formats remaining milliseconds as m:ss (10:00, 0:09). Negative or
 * non-finite values display as 0:00 so a fumbled payload can never show
 * nonsense on the clock.
 */
export function formatClock(ms) {
  const safe = Number.isFinite(Number(ms)) ? Math.max(0, Math.floor(Number(ms))) : 0;
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Human label for a time-control id (falls back to Unlimited). */
export function timeControlLabel(timeControl) {
  const found = TIME_CONTROLS.find((t) => t.id === timeControl);
  return found ? found.label : TIME_CONTROLS[0].label;
}

/**
 * True when a clock reading is at or below the warning threshold (≤ 30s), so
 * the UI can colour the clock red for either side.
 */
export function isLowTime(ms, thresholdMs = 30_000) {
  // null/undefined mean "no clock" (untimed game), not "zero time".
  if (ms == null || ms === '') return false;
  if (!Number.isFinite(Number(ms))) return false;
  return Number(ms) <= thresholdMs;
}
