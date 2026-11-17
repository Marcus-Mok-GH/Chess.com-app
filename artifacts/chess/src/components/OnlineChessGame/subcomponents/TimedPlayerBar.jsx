import PlayerBar from '../../PlayerBar';
import { useLiveClock } from '../hooks/useLiveClock';

/**
 * A player bar that owns its own clock tick.
 *
 * The live clock updates every 250 ms. Keeping that state inside this leaf
 * (instead of the game screen) means a running clock repaints two clock faces
 * rather than the board, the move list and the chat four times a second —
 * which is what makes timed games feel heavy on older phones.
 *
 * @param {object} props
 * @param {object} props.player Player fields for {@link PlayerBar} (name, color…).
 * @param {object|null} [props.serverClock] Latest authoritative clock payload.
 * @param {string} [props.gameStatus] Current game status ('playing', 'finished'…).
 * @returns {JSX.Element}
 */
export default function TimedPlayerBar({ player, serverClock = null, gameStatus = null, ...rest }) {
  const clock = useLiveClock(serverClock);

  // Untimed games send no clock payload; then the bar renders without one.
  if (!clock.limited) {
    return <PlayerBar {...player} {...rest} />;
  }

  const isWhite = player?.color === 'w';
  const side = isWhite ? 'white' : 'black';

  return (
    <PlayerBar
      {...player}
      {...rest}
      clockMs={isWhite ? clock.whiteMs : clock.blackMs}
      clockActive={gameStatus === 'playing' && clock.side === side}
    />
  );
}
