import { useCallback, useEffect, useState } from 'react';
import { createPremove } from '../engine/game/premoves';

/**
 * Holds the single queued premove for a game. It only owns the queued state:
 * each game component decides when a premove may be queued and applies it when
 * its own turn returns, so board/game logic stays in one place.
 *
 * - `enabled` false clears any queued premove (premoves turned off in settings,
 *   game over, resigned, or online game ended).
 * - `resetKey` (e.g. the game id) clears the queue when the board resets.
 */
export function usePremove({ enabled = true, resetKey } = {}) {
  const [premove, setPremove] = useState(null);

  const clearPremove = useCallback(() => {
    setPremove((current) => (current ? null : current));
  }, []);

  const queuePremove = useCallback((from, to, promotion) => {
    const next = createPremove(from, to, promotion);
    if (!next) return false;
    setPremove(next);
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) clearPremove();
  }, [enabled, clearPremove]);

  useEffect(() => {
    clearPremove();
  }, [resetKey, clearPremove]);

  return { premove, queuePremove, clearPremove };
}

export default usePremove;