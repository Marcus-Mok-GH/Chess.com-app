import { useLocation, useSearchParams, useParams } from 'react-router-dom';

import OnlinePlay from './OnlinePlay';
import Play from './Play';

export default function Game() {
  const { gameId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const mode = (searchParams.get('mode') || '').toLowerCase();

  if (mode === 'local') {
    return (
      <Play
        initialGameId={gameId}
        initialSetup={location.state || null}
      />
    );
  }

  // Default: treat /game/:gameId as online game link for backwards compatibility.
  return <OnlinePlay />;
}
