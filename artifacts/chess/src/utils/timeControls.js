/**
 * Time controls available for online games.
 *
 * The ids match the server's `time_control` column so the value can be sent
 * through unchanged. Rapid is 10 + 0 (a flat ten minutes) and Rapid 10+3 is
 * ten minutes with a three-second Fischer increment per move; both feed the
 * same `rapidElo` rating pool.
 */

export const RAPID_MS = 10 * 60 * 1000;
export const RAPID_INCREMENT_MS = 3 * 1000;

// Every control a player can pick. Ranked matchmaking isolates each id into its
// own queue, but the leaderboard only shows the rating pools (see RATING_POOLS).
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
  {
    id: 'rapid_10_3',
    label: 'Rapid 10+3',
    description: '10 min + 3s per move',
  },
];

// The controls that run a clock. Both rapid variants share one rating pool.
export const TIMED_TIME_CONTROL_IDS = ['rapid', 'rapid_10_3'];

// Rating pools shown on the leaderboard, kept separate from the playable
// controls so the two rapid variants do not duplicate the Rapid board.
export const RATING_POOLS = [
  { id: 'unlimited', label: 'Unlimited' },
  { id: 'rapid', label: 'Rapid' },
];

export const DEFAULT_TIME_CONTROL = 'unlimited';

/** True when a control runs a clock (as opposed to unlimited). */
export function isTimedControl(timeControl) {
  return TIMED_TIME_CONTROL_IDS.includes(timeControl);
}

/**
 * The rating pool a control feeds. Both rapid variants read/write `rapidElo`;
 * everything else uses the untimed `elo`.
 */
export function ratingPoolForControl(timeControl) {
  return isTimedControl(timeControl) ? 'rapid' : 'unlimited';
}

/**
 * The rating a user plays a given control with. Rapid reads `rapidElo` while
 * everything else reads the untimed `elo`. Falls back to the default rating
 * for signed-out users.
 */
export function controlRating(user, timeControl) {
  if (!user) return 1200;
  if (ratingPoolForControl(timeControl) === 'rapid') {
    return user.rapidElo ?? user.elo ?? 1200;
  }
  return user.elo ?? 1200;
}

/** Initial remaining time for a control, or null when untimed. */
export function initialClockMs(timeControl) {
  return isTimedControl(timeControl) ? RAPID_MS : null;
}

/** Per-move increment for a control (0 when untimed / no increment). */
export function incrementMsFor(timeControl) {
  return timeControl === 'rapid_10_3' ? RAPID_INCREMENT_MS : 0;
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

/** Human description for a time-control id, or null when unknown. */
export function timeControlDescription(timeControl) {
  const found = TIME_CONTROLS.find((t) => t.id === timeControl);
  return found ? found.description : null;
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
