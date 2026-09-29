/**
 * Server-authoritative clock for timed online games.
 *
 * Storage model (active_games):
 *   time_control        'unlimited' | 'rapid' | 'rapid_10_3'
 *   white_time_ms       remaining ms for White *as of* clock_running_since
 *   black_time_ms       remaining ms for Black *as of* clock_running_since
 *   clock_running_since when the side to move started thinking (null before
 *                       the first move / while the game is waiting)
 *
 * The clock is never nudged forward in a background loop: every read derives
 * the live remaining time from the stored values plus the elapsed wall time
 * since clock_running_since. A move bakes the elapsed time into the mover's
 * remaining value and moves the running reference to the opponent, so clock
 * state stays correct with no scheduler — which matters on serverless hosts.
 */

export const RAPID_MS = 10 * 60 * 1000; // 10 minutes per player
// Fischer increment added to the mover's clock after each move. Rapid 10+0 has
// no increment; Rapid 10+3 adds three seconds per move.
export const RAPID_INCREMENT_MS = 3 * 1000;

// Every control that runs a clock. Pools are isolated per id (10+0 and 10+3
// queue separately) but share one rating pool via ratingPools.js.
export const TIMED_TIME_CONTROL_IDS = ['rapid', 'rapid_10_3'];

export const TIME_CONTROL_IDS = ['unlimited', ...TIMED_TIME_CONTROL_IDS];

/**
 * Normalizes an untrusted time-control value.
 * Anything unknown (including undefined) falls back to 'unlimited' so a bad
 * payload can never silently put a player in a timed game.
 */
export function normalizeTimeControl(value) {
  return typeof value === 'string' && TIME_CONTROL_IDS.includes(value)
    ? value
    : 'unlimited';
}

/** True when a control runs a clock (as opposed to unlimited). */
export function isTimedControl(value) {
  return TIMED_TIME_CONTROL_IDS.includes(normalizeTimeControl(value));
}

/** Starting remaining time for a time control, or null when untimed. */
export function initialClockMs(timeControl) {
  return isTimedControl(timeControl) ? RAPID_MS : null;
}

/** Per-move increment for a time control (0 when untimed / no increment). */
export function incrementMsFor(timeControl) {
  return normalizeTimeControl(timeControl) === 'rapid_10_3' ? RAPID_INCREMENT_MS : 0;
}

function toMs(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function elapsedSince(runningSince, now) {
  if (!runningSince) return 0;
  const started = new Date(runningSince).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now - started);
}

/**
 * Derives the live clock for a game row.
 *
 * @returns {{
 *   timeControl: 'unlimited'|'rapid'|'rapid_10_3',
 *   limited: boolean,
 *   sideToMove: 'white'|'black',
 *   whiteMs: number|null,
 *   blackMs: number|null,
 *   runningSince: Date|string|null,
 *   flagged: 'white'|'black'|null,
 * }}
 * `whiteMs`/`blackMs` are the remaining times right now, and `flagged` is the
 * side whose clock has run out (only computed for a live timed game).
 */
export function evaluateClock(row, now = Date.now()) {
  const timeControl = normalizeTimeControl(row?.time_control);
  const sideToMove = sideToMoveFromFen(row?.fen);
  const limited = TIMED_TIME_CONTROL_IDS.includes(timeControl);
  const runningSince = row?.clock_running_since ?? null;

  if (!limited) {
    return {
      timeControl,
      limited: false,
      sideToMove,
      whiteMs: null,
      blackMs: null,
      runningSince: null,
      flagged: null,
    };
  }

  const running = row?.status === 'playing' && Boolean(runningSince);
  const elapsed = running ? elapsedSince(runningSince, now) : 0;
  const storedWhite = toMs(row?.white_time_ms);
  const storedBlack = toMs(row?.black_time_ms);

  const liveMs = (color) => {
    const stored = color === 'white' ? storedWhite : storedBlack;
    if (stored == null) return null;
    return running && sideToMove === color ? Math.max(0, stored - elapsed) : Math.max(0, stored);
  };

  const whiteMs = liveMs('white');
  const blackMs = liveMs('black');

  let flagged = null;
  if (row?.status === 'playing') {
    if (sideToMove === 'white' && whiteMs === 0) flagged = 'white';
    else if (sideToMove === 'black' && blackMs === 0) flagged = 'black';
  }

  return {
    timeControl,
    limited: true,
    sideToMove,
    whiteMs,
    blackMs,
    runningSince,
    flagged,
  };
}

/**
 * Bakes a completed move into the clock: deducts the elapsed time from the
 * mover and hands the running clock to the opponent.
 *
 * Returns the new stored values, or `{ flagged: <color> }` when the mover's
 * time already ran out — in that case the move must not be applied.
 */
export function applyMoveToClock(row, moverColor, now = Date.now()) {
  const clock = evaluateClock(row, now);
  if (!clock.limited) {
    return { flagged: null, whiteMs: null, blackMs: null, runningSince: null };
  }
  if (clock.flagged) return { flagged: clock.flagged };

  // Fischer increment: the mover gains their increment for completing a move.
  // Applied after the elapsed deduction and before the clock hands over.
  const increment = incrementMsFor(clock.timeControl);
  const whiteMs =
    increment > 0 && moverColor === 'white' ? clock.whiteMs + increment : clock.whiteMs;
  const blackMs =
    increment > 0 && moverColor === 'black' ? clock.blackMs + increment : clock.blackMs;

  return {
    flagged: null,
    whiteMs,
    blackMs,
    runningSince: new Date(now),
  };
}

/** Reads the side to move ('white' | 'black') out of a FEN. */
export function sideToMoveFromFen(fen) {
  if (typeof fen !== 'string') return 'white';
  const parts = fen.trim().split(/\s+/);
  return parts[1] === 'b' ? 'black' : 'white';
}

/** The color that wins when `color` flags on time. */
export function opponentOf(color) {
  return color === 'white' ? 'black' : 'white';
}
