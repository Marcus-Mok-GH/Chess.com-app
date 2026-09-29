import { useEffect, useMemo, useState } from 'react';

const TICK_MS = 250;

/**
 * Ticks an online game's clock locally between polls.
 *
 * The server sends authoritative *remaining* values (already deducted) plus
 * the side on the move. The client only counts down that side from the moment
 * the payload arrived, so a slow or dropped poll can never make a clock run
 * backwards or drift ahead of the server. The server still has the final say:
 * a locally observed flag is only a hint until the next poll confirms it.
 *
 * @param {{
 *   timeControl?: string,
 *   status?: string,
 *   whiteMs?: number|null,
 *   blackMs?: number|null,
 *   side?: 'white'|'black'|null,
 *   receivedAt?: number,
 * }} serverClock Latest clock payload from the server.
 */
export function useLiveClock(serverClock) {
  const limited = serverClock?.timeControl === 'rapid';
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!limited) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
    // Re-arm the interval whenever a fresh server payload arrives so ticks stay
    // aligned with the downloaded remaining values.
  }, [limited, serverClock?.receivedAt]);

  return useMemo(() => {
    if (!limited) {
      return {
        limited: false,
        whiteMs: null,
        blackMs: null,
        flagged: null,
        side: null,
      };
    }

    const playing = serverClock?.status === 'playing';
    const running = playing && Boolean(serverClock?.side);
    const elapsed = running
      ? Math.max(0, Date.now() - (serverClock.receivedAt || Date.now()))
      : 0;

    const remaining = (color) => {
      const stored = color === 'white' ? serverClock.whiteMs : serverClock.blackMs;
      if (stored == null) return null;
      const live = running && serverClock.side === color ? stored - elapsed : stored;
      return Math.max(0, live);
    };

    const whiteMs = remaining('white');
    const blackMs = remaining('black');

    // Only the side to move can flag.
    let flagged = null;
    if (playing && serverClock?.side === 'white' && whiteMs === 0) {
      flagged = 'white';
    } else if (playing && serverClock?.side === 'black' && blackMs === 0) {
      flagged = 'black';
    }

    return {
      limited: true,
      whiteMs,
      blackMs,
      flagged,
      side: serverClock?.side || null,
    };
    // `tick` is a dependency on purpose: it is what re-derives the countdown
    // every TICK_MS while the deps above stay unchanged between polls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    limited,
    tick,
    serverClock?.status,
    serverClock?.whiteMs,
    serverClock?.blackMs,
    serverClock?.side,
    serverClock?.receivedAt,
  ]);
}
