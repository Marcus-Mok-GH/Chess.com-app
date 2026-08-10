import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Search, ArrowLeft, Loader2, ChevronRight } from 'lucide-react';
import ChessBoard from '../components/ChessBoard';
import api from '../services/api';
import './Openings.css';

function sideToMove(fen) {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function statsPct(stats, key) {
  const total = Number(stats?.moves) || 0;
  if (!total) return 0;
  return Math.round((Number(stats?.[key]) || 0) / total * 100);
}

function statsTotal(stats) {
  return Number(stats?.moves) || 0;
}

export default function Openings() {
  const [roots, setRoots] = useState([]);
  const [rootsLoading, setRootsLoading] = useState(true);
  const [path, setPath] = useState([]);
  const [position, setPosition] = useState(null);
  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const loadChildren = useCallback(async (fen) => {
    setChildrenLoading(true);
    setError(null);
    try {
      const data = await api.getOpeningChildren(fen);
      setChildren(data.children || []);
      setPosition(data.position || null);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load moves');
      setChildren([]);
      setPosition(null);
    } finally {
      setChildrenLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getOpeningRoots()
      .then((data) => {
        if (cancelled) return;
        const openings = data.openings || [];
        setRoots(openings);
        const start = openings.find((o) => o.eco === 'A00' && o.name === 'Starting Position') || openings[0];
        if (start) {
          const step = { fen: start.fen, name: start.name, eco: start.eco, san: '', stats: start.stats };
          setPath([step]);
          return loadChildren(start.fen);
        }
        return undefined;
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Failed to load openings');
      })
      .finally(() => {
        if (!cancelled) setRootsLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadChildren]);

  const openRoot = (root) => {
    const step = { fen: root.fen, name: root.name, eco: root.eco, san: '', stats: root.stats };
    setPath([step]);
    loadChildren(root.fen);
  };

  const openChild = (child) => {
    const step = { fen: child.fen, name: child.name, eco: child.eco, san: child.san, stats: child.stats };
    setPath((current) => [...current, step]);
    loadChildren(child.fen);
  };

  const goBack = () => {
    if (path.length <= 1) return;
    const next = path.slice(0, -1);
    setPath(next);
    loadChildren(next[next.length - 1].fen);
  };

  const jumpTo = (index) => {
    const next = path.slice(0, index + 1);
    setPath(next);
    loadChildren(next[next.length - 1].fen);
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api.searchOpenings(q);
      setSearchResults(data.results || []);
    } catch (searchError) {
      setError(searchError.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const currentFen = path.length ? path[path.length - 1].fen : null;

  return (
    <div className="openings-page">
      <div className="openings-container">
        <header className="openings-header">
          <div className="openings-eyebrow">
            <BookOpen size={13} />
            <span>Opening Explorer</span>
          </div>
          <h1 className="openings-title">Openings</h1>
          <p className="openings-subtitle">
            Browse the encyclopedic opening tree, follow main lines, and explore move statistics.
          </p>

          <form className="openings-search" onSubmit={handleSearch} role="search">
            <Search size={15} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search an opening or ECO code…"
              aria-label="Search openings"
            />
            <button type="submit" disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="spin" size={14} /> : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="openings-search-results">
              <div className="openings-search-label">Search results</div>
              {searchResults.map((result) => (
                <button
                  key={result.fen}
                  type="button"
                  className="openings-search-result"
                  onClick={() => openRoot(result)}
                >
                  <span className="openings-search-eco">{result.eco}</span>
                  <span className="openings-search-name">{result.name}</span>
                  <span className="openings-search-pgn">{result.pgn}</span>
                </button>
              ))}
            </div>
          )}
        </header>

        {error && <p className="openings-error" role="alert">{error}</p>}

        {rootsLoading ? (
          <div className="openings-loading" role="status">
            <Loader2 className="spin" size={22} />
            <span>Loading opening book…</span>
          </div>
        ) : path.length === 0 ? (
          <section className="openings-roots">
            <h2 className="openings-section-title">Major openings</h2>
            <div className="openings-roots-grid">
              {roots.map((root) => (
                <button
                  key={`${root.eco}-${root.name}`}
                  type="button"
                  className="opening-card"
                  onClick={() => openRoot(root)}
                >
                  <span className="opening-card-eco">{root.eco}</span>
                  <span className="opening-card-name">{root.name}</span>
                  <span className="opening-card-stats">
                    {formatGames(statsTotal(root.stats))} games
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="openings-layout">
            <div className="openings-board-wrap">
              <ChessBoard
                position={currentFen}
                canDragPiece={() => false}
                boardOrientation={sideToMove(currentFen)}
                boardTheme="green"
                showCoordinates
              />
              <div className="openings-position-label">
                <span className="openings-position-eco">{position?.eco || path[path.length - 1].eco || '—'}</span>
                <span className="openings-position-name">
                  {position?.name || path[path.length - 1].name || 'Position'}
                </span>
              </div>
            </div>

            <aside className="openings-side">
              <div className="openings-crumb-card">
                <div className="openings-crumb-row">
                  <button
                    type="button"
                    className="openings-back"
                    onClick={goBack}
                    disabled={path.length <= 1}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <span className="openings-crumb-turn">
                    {sideToMove(currentFen) === 'white' ? 'White' : 'Black'} to move
                  </span>
                </div>
                <div className="openings-crumbs" aria-label="Move path">
                  {path.map((step, index) => (
                    <span key={`${step.fen}-${index}`} className="openings-crumb">
                      {index > 0 && <ChevronRight size={12} className="openings-crumb-sep" />}
                      <button
                        type="button"
                        className={`openings-crumb-chip ${index === path.length - 1 ? 'is-current' : ''}`}
                        onClick={() => jumpTo(index)}
                        disabled={index === path.length - 1}
                        title={step.name || step.san}
                      >
                        {index === 0 ? step.name : step.san}
                      </button>
                    </span>
                  ))}
                </div>
                {position?.pgn && <div className="openings-pgn">{position.pgn}</div>}
              </div>

              <div className="openings-moves-card">
                <div className="openings-moves-label">Continue the line</div>
                {childrenLoading ? (
                  <div className="openings-loading" role="status">
                    <Loader2 className="spin" size={18} />
                    <span>Loading moves…</span>
                  </div>
                ) : children.length === 0 ? (
                  <p className="openings-empty">No book continuations from this position.</p>
                ) : (
                  <ul className="openings-move-list">
                    {children.map((child) => (
                      <li key={`${child.san}-${child.fen}`}>
                        <button type="button" className="opening-move" onClick={() => openChild(child)}>
                          <div className="opening-move-top">
                            <span className="opening-move-san">{child.san}</span>
                            {(child.name || child.eco) && (
                              <span className="opening-move-book">
                                {child.eco ? `${child.eco} · ` : ''}{child.name || 'Book position'}
                              </span>
                            )}
                          </div>
                          <MoveBar stats={child.stats} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function MoveBar({ stats }) {
  const total = statsTotal(stats);
  if (!total) {
    return <div className="move-bar move-bar--empty">No game data</div>;
  }
  const white = statsPct(stats, 'whiteWins');
  const draws = statsPct(stats, 'draws');
  const black = statsPct(stats, 'blackWins');

  return (
    <div className="move-bar">
      <div className="move-bar-track" aria-hidden="true">
        <span className="move-bar-seg move-bar-seg--white" style={{ width: `${white}%` }} />
        <span className="move-bar-seg move-bar-seg--draw" style={{ width: `${draws}%` }} />
        <span className="move-bar-seg move-bar-seg--black" style={{ width: `${black}%` }} />
      </div>
      <div className="move-bar-legend">
        <span className="move-bar-stat"><i className="dot dot--white" /> {white}% white</span>
        <span className="move-bar-stat"><i className="dot dot--draw" /> {draws}% draw</span>
        <span className="move-bar-stat"><i className="dot dot--black" /> {black}% black</span>
        <span className="move-bar-games">{formatGames(total)} games</span>
      </div>
    </div>
  );
}

function formatGames(n) {
  if (!n) return '0';
  return new Intl.NumberFormat('en-US').format(n);
}
