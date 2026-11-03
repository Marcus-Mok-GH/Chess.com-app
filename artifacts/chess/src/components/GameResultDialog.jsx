import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';

export function botGameOutcome(game, playerColor, hasResigned) {
  if (hasResigned) return 'lost';
  if (!game?.isCheckmate()) return null;
  return (game.turn() === playerColor) ? 'lost' : 'won';
}

export function onlineGameOutcome(gameStatus, winner, playerColor, endReason) {
  if (gameStatus !== 'ended' || !['checkmate', 'resignation'].includes(endReason)) return null;
  if (winner !== 'white' && winner !== 'black') return null;
  return winner === playerColor ? 'won' : 'lost';
}

export default function GameResultDialog({ gameId, outcome }) {
  const t = useT();
  const [dismissedKey, setDismissedKey] = useState(null);
  const [wasActive, setWasActive] = useState(false);
  const key = `${gameId}:${outcome}`;

  useEffect(() => {
    if (!outcome) setWasActive(true);
  }, [outcome, gameId]);

  useEffect(() => {
    if (!outcome || dismissedKey === key) return;
    const onEscape = (event) => {
      if (event.key === 'Escape') setDismissedKey(key);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [key, outcome, dismissedKey]);

  if (!outcome || !wasActive || dismissedKey === key) return null;

  return (
    <div className="game-result-backdrop">
      <div className="game-result-dialog" role="dialog" aria-modal="true" aria-labelledby="game-result-heading">
        <div className={`game-result-symbol ${outcome}`} aria-hidden="true">{outcome === 'won' ? '♕' : '♟'}</div>
        <h2 id="game-result-heading">{t(outcome === 'won' ? 'You won' : 'You lost')}{outcome === 'won' ? '!' : ''}</h2>
        <button type="button" onClick={() => setDismissedKey(key)}>{t('Close')}</button>
      </div>
    </div>
  );
}
