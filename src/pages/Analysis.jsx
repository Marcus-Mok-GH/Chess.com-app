import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '../components/ChessBoard';
import { useSettings } from '../contexts/SettingsContext';
import GameAnalysis from '../components/GameAnalysis';
import api from '../services/api';
import { normalizeMoveHistory, toDetailedMoveHistory, toSanHistory } from '../engine/game/moveHistory';
import './Analysis.css';

function getPositionAtMove(history, moveIndex) {
  const game = new Chess();
  const moves = normalizeMoveHistory(history);
  const sanMoves = toSanHistory(moves);
  
  for (let i = 0; i < moveIndex && i < sanMoves.length; i++) {
    try {
      const ok = game.move(sanMoves[i]);
      if (!ok) {
        console.warn(`[Analysis] Invalid move at index ${i}: "${sanMoves[i]}"`);
        break;
      }
    } catch (error) {
      console.error(`[Analysis] Error applying move at index ${i}: "${sanMoves[i]}"`, error);
      break;
    }
  }
  return game;
}

export default function Analysis() {
  const navigate = useNavigate();
  const { gameId: gameIdParam } = useParams();
  const { state } = useLocation();
  const { settings } = useSettings();
  
  // Ensure moveHistory is always a valid array - handle null, undefined, or non-array values
  const rawMoveHistory = state?.moveHistory;
  const [moveHistory, setMoveHistory] = useState(normalizeMoveHistory(rawMoveHistory));
  const [initialMoveIndex, setInitialMoveIndex] = useState(null);
  const gameId = gameIdParam ?? null;
  const [boardOrientation, setBoardOrientation] = useState('white');
  const [activeTab, setActiveTab] = useState('report');
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Debug logging on mount and when data changes
  useEffect(() => {
    console.log('[Analysis] Page loaded with:', {
      gameId,
      hasState: !!state,
      rawMoveHistoryType: typeof rawMoveHistory,
      rawMoveHistoryIsArray: Array.isArray(rawMoveHistory),
      rawMoveHistoryLength: rawMoveHistory?.length,
      moveHistoryLength: moveHistory.length,
      firstMove: moveHistory[0],
      lastMove: moveHistory[moveHistory.length - 1],
    });
    
    // Check for potential issues
    if (gameId && moveHistory.length === 0) {
      console.warn('[Analysis] Game ID present but no move history - game may not have been saved correctly');
    }
    
    if (rawMoveHistory && !Array.isArray(rawMoveHistory)) {
      console.error('[Analysis] moveHistory is not an array:', rawMoveHistory);
    }
  }, [gameId, state, rawMoveHistory, moveHistory]);

  useEffect(() => {
    if (moveHistory.length > 0 || !gameId) return;

    let isMounted = true;
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const match = await api.getGameByCode(gameId);
        if (match) {
          const normalized = normalizeMoveHistory(match.move_history);
          if (isMounted) {
            setMoveHistory(normalized);
            if (match.fen) {
              const tempGame = new Chess();
              const loaded = tempGame.load(match.fen);
              if (loaded) {
                setInitialMoveIndex(tempGame.history().length);
              }
            }
          }
        } else if (isMounted) {
          setLoadError('Game not found in history');
        }
      } catch (error) {
        console.error('[Analysis] Failed to load game history:', error);
        if (isMounted) {
          setLoadError('Failed to load game history');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [gameId, moveHistory.length]);

  const sanMoves = useMemo(() => toSanHistory(moveHistory), [moveHistory]);

  const [moveIndex, setMoveIndex] = useState(0);

  useEffect(() => {
    if (initialMoveIndex !== null) {
      setMoveIndex(Math.min(initialMoveIndex, sanMoves.length));
      setInitialMoveIndex(null);
      return;
    }
    setMoveIndex(sanMoves.length);
  }, [initialMoveIndex, sanMoves.length]);

  const position = useMemo(() => getPositionAtMove(moveHistory, moveIndex), [moveHistory, moveIndex]);

  const movePairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < sanMoves.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: sanMoves[i],
        whiteIndex: i + 1,
        black: sanMoves[i + 1] || '',
        blackIndex: i + 2,
      });
    }
    return pairs;
  }, [sanMoves]);

  const customSquareStyles = useMemo(() => {
    if (moveIndex <= 0 || moveIndex > sanMoves.length) return {};
    const lastMove = position.history({ verbose: true }).pop();
    if (!lastMove) return {};
    return {
      [lastMove.from]: { backgroundColor: 'rgba(129, 182, 76, 0.4)' },
      [lastMove.to]: { backgroundColor: 'rgba(129, 182, 76, 0.4)' },
    };
  }, [position, moveIndex, sanMoves.length]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSquareClick = useCallback(() => {}, []);

  const handlePieceDrop = useCallback(() => false);

  const normalizedMoveHistory = useMemo(
    () => toDetailedMoveHistory(moveHistory),
    [moveHistory]
  );

  const hasGame = moveHistory.length > 0 || gameId;

  // Show error state if there was a problem loading the data
  if (loadError) {
    return (
      <div className="analysis-page">
        <header className="analysis-header-bar">
          <button type="button" className="analysis-back" onClick={handleBack} aria-label="Back">
            ← Back
          </button>
          <h1 className="analysis-title">Game Review</h1>
          <div className="analysis-header-spacer" />
        </header>
        <div className="analysis-empty">
          <div className="analysis-empty-card">
            <h2>⚠️ Error Loading Game</h2>
            <p>{loadError}</p>
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '8px' }}>
              Please go back and try again. If the problem persists, the game data may be corrupted.
            </p>
            <button type="button" className="btn btn-primary" onClick={handleBack}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-page">
      <header className="analysis-header-bar">
        <button type="button" className="analysis-back" onClick={handleBack} aria-label="Back">
          ← Back
        </button>
        <h1 className="analysis-title">
          Game Review
          {gameId && <span className="analysis-game-id"> — {gameId}</span>}
        </h1>
        <div className="analysis-header-spacer" />
      </header>

      {hasGame ? (
        <div className="analysis-layout">
          <div className="analysis-board-section">
            <div className="analysis-board-wrap">
              <ChessBoard
                position={position}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                boardOrientation={boardOrientation}
                customSquareStyles={customSquareStyles}
                showCoordinates={settings.showCoordinates}
                boardTheme={settings.boardTheme}
              />
            </div>
            <div className="analysis-board-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              >
                Flip board
              </button>
              <div className="analysis-move-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={moveIndex <= 0}
                  onClick={() => setMoveIndex((i) => Math.max(0, i - 1))}
                >
                  ‹ Prev
                </button>
                <span className="analysis-move-label">
                  {moveIndex === 0 ? 'Start' : `Move ${moveIndex}`}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={moveIndex >= sanMoves.length}
                  onClick={() => setMoveIndex((i) => Math.min(sanMoves.length, i + 1))}
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>

          <div className="analysis-panel">
            {isLoading && (
              <div className="analysis-panel-loading">
                <div className="spinner"></div>
                <p>Loading game history...</p>
              </div>
            )}
            <div className="analysis-tabs">
              <button
                type="button"
                className={`analysis-tab ${activeTab === 'report' ? 'active' : ''}`}
                onClick={() => setActiveTab('report')}
              >
                Report
              </button>
              <button
                type="button"
                className={`analysis-tab ${activeTab === 'moves' ? 'active' : ''}`}
                onClick={() => setActiveTab('moves')}
              >
                Moves
              </button>
            </div>

            <div className="analysis-tab-content">
              {activeTab === 'report' && (
                <div className="analysis-report-pane">
                  <GameAnalysis
                    moveHistory={normalizedMoveHistory}
                    gameId={gameId}
                    variant="inline"
                    onClose={handleBack}
                  />
                </div>
              )}
              {activeTab === 'moves' && (
                <div className="analysis-moves-pane">
                  <div className="analysis-moves-list">
                    {movePairs.length === 0 ? (
                      <p className="no-moves">No moves yet</p>
                    ) : (
                      movePairs.map((pair) => (
                        <div key={pair.number} className="analysis-move-row">
                          <span className="analysis-move-num">{pair.number}.</span>
                          <button
                            type="button"
                            className={`analysis-move white ${moveIndex === pair.whiteIndex ? 'active' : ''}`}
                            onClick={() => setMoveIndex(pair.whiteIndex)}
                          >
                            {pair.white}
                          </button>
                          <button
                            type="button"
                            className={`analysis-move black ${moveIndex === pair.blackIndex ? 'active' : ''}`}
                            onClick={() => setMoveIndex(pair.blackIndex)}
                            disabled={!pair.black}
                          >
                            {pair.black || '...'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="analysis-empty">
          <div className="analysis-empty-card">
            <h2>{gameId ? `Game ${gameId} not found` : 'No game to analyze'}</h2>
            <p>
              {gameId
                ? 'This game cannot be reviewed. Finish a game and click "Game Review" to open it here.'
                : 'Finish a game (vs Computer or Online) and click "Game Review" to open this page.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={handleBack}>
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
