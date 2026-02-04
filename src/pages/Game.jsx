import { useLocation, useSearchParams, useParams } from 'react-router-dom';

import OnlinePlay from './OnlinePlay';
import Play from './Play';

export default function Game() {
  const { gameId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const mode = (searchParams.get('mode') || '').toLowerCase();
  const variant = (searchParams.get('variant') || '').toLowerCase();

  if (mode === 'local') {
    const stateSetup = location.state || {};
    const initialSetup = {
      ...stateSetup,
      ...(variant === 'pass' ? { gameMode: 'pass' } : {}),
    };
    return (
      <Play
        initialGameId={gameId}
        initialSetup={Object.keys(initialSetup).length ? initialSetup : null}
      />
    );
  }

  // Default: treat /game/:gameId as online game link for backwards compatibility.
  return <OnlinePlay />;
}
