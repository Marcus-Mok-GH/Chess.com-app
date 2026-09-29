/**
 * Time controls available for online games.
 *
 * The ids match the server's `time_control` column so the value can be sent
 * through unchanged. Blitz is a flat three minutes and Blitz 3+2 keeps the
 * same three minutes but adds a two-second Fischer increment per move. Rapid
 * is 10 + 0 (a flat ten minutes), Rapid 10+3 adds a three-second increment per
 * move, and Classical is a flat thirty minutes. Classical 30+5 keeps the same
 * thirty minutes but adds a five-second increment per move. Blitz 3+0/3+2
 * share the `blitzElo` pool; Rapid 10+0/10+3 share the `rapidElo` pool;
 * Classical 30+0/30+5 share the `classicalElo` pool.
 */

export const BLITZ_MS = 3 * 60 * 1000;
export const RAPID_MS = 10 * 60 * 1000;
export const CLASSICAL_MS = 30 * 60 * 1000;
export const BLITZ_INCREMENT_MS = 2 * 1000;
export const RAPID_INCREMENT_MS = 3 * 1000;
export const CLASSICAL_INCREMENT_MS = 5 * 1000;

// Every control a player can pick. Ranked matchmaking isolates each id into its
// own queue, but the leaderboard only shows the rating pools (see RATING_POOLS).
export const TIME_CONTROLS = [
  {
    id: 'unlimited',
    label: 'Unlimited',
    description: 'No clock — take as long as you like',
  },
  {
    id: 'blitz',
    label: 'Blitz',
    description: '3 minutes each',
  },
  {
    id: 'blitz_3_2',
    label: 'Blitz 3+2',
    description: '3 min + 2s per move',
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
  {
    id: 'classical',
    label: 'Classical',
    description: '30 minutes each',
  },
  {
    id: 'classical_30_5',
    label: 'Classical 30+5',
    description: '30 min + 5s per move',
  },
];

// The controls that run a clock, and the starting time for each.
export const TIMED_TIME_CONTROL_IDS = [
  'blitz',
  'blitz_3_2',
  'rapid',
  'rapid_10_3',
  'classical',
  'classical_30_5',
];

const INITIAL_CLOCK_MS_BY_CONTROL = {
  blitz: BLITZ_MS,
  blitz_3_2: BLITZ_MS,
  rapid: RAPID_MS,
  rapid_10_3: RAPID_MS,
  classical: CLASSICAL_MS,
  classical_30_5: CLASSICAL_MS,
};

// Per-move increment for each increment control. Flat controls are absent.
const INCREMENT_MS_BY_CONTROL = {
  blitz_3_2: BLITZ_INCREMENT_MS,
  rapid_10_3: RAPID_INCREMENT_MS,
  classical_30_5: CLASSICAL_INCREMENT_MS,
};

// Which rating pool a control feeds, and the user field that holds it.
const RATING_POOL_BY_CONTROL = {
  blitz: 'blitz',
  blitz_3_2: 'blitz',
  rapid: 'rapid',
  rapid_10_3: 'rapid',
  classical: 'classical',
  classical_30_5: 'classical',
};
const RATING_FIELD_BY_POOL = {
  blitz: 'blitzElo',
  rapid: 'rapidElo',
  classical: 'classicalElo',
};

// Rating pools shown on the leaderboard, kept separate from the playable
// controls so the two Blitz and two Rapid variants do not duplicate those
// boards.
export const RATING_POOLS = [
  { id: 'unlimited', label: 'Unlimited' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'classical', label: 'Classical' },
];

export const DEFAULT_TIME_CONTROL = 'unlimited';

/** True when a control runs a clock (as opposed to unlimited). */
export function isTimedControl(timeControl) {
  return TIMED_TIME_CONTROL_IDS.includes(timeControl);
}

/**
 * The rating pool a control feeds. Both Blitz variants share and read/write
 * `blitzElo`, both rapid variants share `rapidElo`, Classical reads
 * `classicalElo`, and everything else uses the untimed `elo`.
 */
export function ratingPoolForControl(timeControl) {
  return RATING_POOL_BY_CONTROL[timeControl] ?? 'unlimited';
}

/**
 * The rating a user plays a given control with, read from the control's pool
 * and falling back to the default for signed-out users.
 */
export function controlRating(user, timeControl) {
  if (!user) return 1200;
  const field = RATING_FIELD_BY_POOL[ratingPoolForControl(timeControl)];
  if (field) return user[field] ?? user.elo ?? 1200;
  return user.elo ?? 1200;
}

/** Initial remaining time for a control, or null when untimed. */
export function initialClockMs(timeControl) {
  return INITIAL_CLOCK_MS_BY_CONTROL[timeControl] ?? null;
}

/** Per-move increment for a control (0 when untimed / no increment). */
export function incrementMsFor(timeControl) {
  return INCREMENT_MS_BY_CONTROL[timeControl] ?? 0;
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
