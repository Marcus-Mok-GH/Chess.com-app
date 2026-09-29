/**
 * Server-authoritative clock for timed online games.
 *
 * Storage model (active_games):
 *   time_control        'unlimited' | 'rapid'
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

export const RAPID_MS = 10 * 60 * 1000; // Rapid is 10 + 0 (flat ten minutes)

export const TIME_CONTROL_IDS = ['unlimited', 'rapid'];

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

/** Starting remaining time for a time control, or null when untimed. */
export function initialClockMs(timeControl) {
  return normalizeTimeControl(timeControl) === 'rapid' ? RAPID_MS : null;
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
 *   timeControl: 'unlimited'|'rapid',
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
  const limited = timeControl === 'rapid';
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

  return {
    flagged: null,
    whiteMs: clock.whiteMs,
    blackMs: clock.blackMs,
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
