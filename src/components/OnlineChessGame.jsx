import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ChessBoard from './ChessBoard';
import { Chess } from 'chess.js';
import { useSettings } from '../contexts/SettingsContext';
import { playSoundEffect } from '../utils/sound';
import MoveHistory from './MoveHistory';
import { normalizeMoveHistory, toStoredMoveHistory, buildGameFromHistory } from '../engine/game/moveHistory';
import PlayerBar from './PlayerBar';
import AnimatedPiece from './AnimatedPiece';
import ChessPieceIcon from './ChessPieceIcon';
import socketService from '../services/socket';

function findKingSquare(game, color) {
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'k' && piece.color === color) {
        return String.fromCharCode(97 + col) + (8 - row);
      }
    }
  }
  return null;
}

const REACTIONS = ['👍', '👏', '🤔', '😮', '🎉', '😅'];

export default function OnlineChessGame({ gameId, playerId, playerColor, opponentInfo, onLeave }) {
  const { settings } = useSettings();
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [animatingPieces, setAnimatingPieces] = useState([]);
  const [opponentStatus, setOpponentStatus] = useState('connected');
  const [incomingReaction, setIncomingReaction] = useState(null);
  const [gameStatus, setGameStatus] = useState('playing');
  const [whitePlayer, setWhitePlayer] = useState({ name: 'White', elo: null });
  const navigate = useNavigate();
  const [blackPlayer, setBlackPlayer] = useState({ name: 'Black', elo: null });
  const [eloChange, setEloChange] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferedBy, setDrawOfferedBy] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [winner, setWinner] = useState(null);
  const [moveError, setMoveError] = useState('');
  const [showVictory, setShowVictory] = useState(false);
  const moveErrorTimeoutRef = useRef(null);
  const victoryTimeoutRef = useRef(null);
  const lastVictoryKeyRef = useRef(null);

  const gameRef = useRef(game);
  const settingsRef = useRef(settings);
  const animationIdRef = useRef(0);
  const colorCode = playerColor === 'white' ? 'w' : 'b';
  const boardOrientation = playerColor;

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => () => {
    if (moveErrorTimeoutRef.current) {
      clearTimeout(moveErrorTimeoutRef.current);
    }
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
  }, []);

  // Set up socket event listeners for game
  useEffect(() => {
    if (!gameId || !playerId) return;

    console.log('[OnlineChessGame] Setting up socket listeners for game:', gameId);

    const attemptJoin = () => {
      if (socketService.isConnected) {
        socketService.joinGame(gameId, playerId);
      }
    };

    // Join the game room (or retry after reconnect)
    attemptJoin();

    const handleGameState = (data) => {
      console.log('[OnlineChessGame] Received game state:', data);
      const normalizedHistory = normalizeMoveHistory(data.moveHistory);
      const chess = buildGameFromHistory(normalizedHistory, data.fen);
      setGame(chess);
      setMoveHistory(normalizedHistory);
      setGameStatus(data.status);
      
      // Set player info
      if (data.whitePlayer) {
        setWhitePlayer({
          name: data.whitePlayer,
          elo: data.whiteElo
        });
      }
      if (data.blackPlayer) {
        setBlackPlayer({
          name: data.blackPlayer,
          elo: data.blackElo
        });
      }
    };

    const handleMoveMade = (data) => {
      console.log('[OnlineChessGame] Move made:', data);
      if (data.playerId !== playerId) {
        const normalizedHistory = normalizeMoveHistory(data.moveHistory);
        const chess = buildGameFromHistory(normalizedHistory, data.fen);
        setGame(chess);
        setMoveHistory(normalizedHistory);
      }
    };

    const handleGameEnded = (data) => {
      console.log('[OnlineChessGame] Game ended:', data);
      setGameStatus('ended');
      setEndReason(data.reason || null);
      setWinner(data.result || null);
    };

    const handlePlayerJoined = (data) => {
      console.log('[OnlineChessGame] Player joined:', data);
      setOpponentStatus('connected');
    };

    const handlePlayerLeft = (data) => {
      console.log('[OnlineChessGame] Player left:', data);
      if (data.playerId !== playerId) {
        setOpponentStatus('disconnected');
      }
    };

    const handleOpponentDisconnected = (data) => {
      console.log('[OnlineChessGame] Opponent disconnected:', data);
      setOpponentStatus('disconnected');
    };

    const handleChatMessage = (data) => {
      console.log('[OnlineChessGame] Chat message:', data);
      // Could show chat messages
    };

    const handleEloUpdated = (data) => {
      console.log('[OnlineChessGame] ELO updated:', data);
      setEloChange(data.change);
    };

    const handleDrawOffered = (data) => {
      console.log('[OnlineChessGame] Draw offered:', data);
      if (data.offeredBy !== playerId) {
        setDrawOffered(true);
        setDrawOfferedBy(data.offeredBy);
      }
    };

    const handleDrawDeclined = (data) => {
      console.log('[OnlineChessGame] Draw declined:', data);
      setDrawOffered(false);
      setDrawOfferedBy(null);
    };

    const handleMoveError = (data) => {
      console.error('[OnlineChessGame] Move error:', data);
      setMoveError(data.message || 'An error occurred while making your move');
      // Clear error after 5 seconds
      if (moveErrorTimeoutRef.current) {
        clearTimeout(moveErrorTimeoutRef.current);
      }
      moveErrorTimeoutRef.current = setTimeout(() => setMoveError(''), 5000);
    };

    const handleConnectionStatus = (data) => {
      if (data?.connected) {
        attemptJoin();
      }
    };

    // Subscribe to socket events
    socketService.on('game_state', handleGameState);
    socketService.on('move_made', handleMoveMade);
    socketService.on('game_ended', handleGameEnded);
    socketService.on('player_joined', handlePlayerJoined);
    socketService.on('player_left', handlePlayerLeft);
    socketService.on('opponent_disconnected', handleOpponentDisconnected);
    socketService.on('chat_message', handleChatMessage);
    socketService.on('elo_updated', handleEloUpdated);
    socketService.on('draw_offered', handleDrawOffered);
    socketService.on('draw_declined', handleDrawDeclined);
    socketService.on('move_error', handleMoveError);
    socketService.on('connection_status', handleConnectionStatus);

    return () => {
      // Unsubscribe from socket events
      socketService.off('game_state', handleGameState);
      socketService.off('move_made', handleMoveMade);
      socketService.off('game_ended', handleGameEnded);
      socketService.off('player_joined', handlePlayerJoined);
      socketService.off('player_left', handlePlayerLeft);
      socketService.off('opponent_disconnected', handleOpponentDisconnected);
      socketService.off('chat_message', handleChatMessage);
      socketService.off('elo_updated', handleEloUpdated);
      socketService.off('draw_offered', handleDrawOffered);
      socketService.off('draw_declined', handleDrawDeclined);
      socketService.off('move_error', handleMoveError);
      socketService.off('connection_status', handleConnectionStatus);
      
      // Leave the game room
      socketService.leaveGame(gameId, playerId);
    };
  }, [gameId, playerId]);

  // Set opponent info when received
  useEffect(() => {
    if (opponentInfo) {
      if (playerColor === 'white') {
        setBlackPlayer({
          name: opponentInfo.name,
          elo: opponentInfo.elo
        });
      } else {
        setWhitePlayer({
          name: opponentInfo.name,
          elo: opponentInfo.elo
        });
      }
    }
  }, [opponentInfo, playerColor]);

  useEffect(() => {
    if (endReason !== 'checkmate' || !winner || !playerColor) {
      return;
    }

    if (winner !== playerColor) {
      return;
    }

    const victoryKey = `${gameId}-${winner}-${endReason}`;
    if (lastVictoryKeyRef.current === victoryKey) {
      return;
    }

    lastVictoryKeyRef.current = victoryKey;
    setShowVictory(true);
    if (victoryTimeoutRef.current) {
      clearTimeout(victoryTimeoutRef.current);
    }
    victoryTimeoutRef.current = setTimeout(() => setShowVictory(false), 2200);
  }, [endReason, winner, playerColor, gameId]);

  const getGameStatusText = useMemo(() => {
    if (game.isCheckmate()) return 'checkmate';
    if (game.isStalemate()) return 'stalemate';
    if (game.isDraw()) return 'draw';
    if (game.inCheck()) return 'check';
    return 'playing';
  }, [game]);

  const triggerAnimation = useCallback((moveData) => {
    const animations = [];

    if (moveData.flags && moveData.flags.includes('k')) {
      const rookFrom = moveData.color === 'w' ? 'h1' : 'h8';
      const rookTo = moveData.color === 'w' ? 'f1' : 'f8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else if (moveData.flags && moveData.flags.includes('q')) {
      const rookFrom = moveData.color === 'w' ? 'a1' : 'a8';
      const rookTo = moveData.color === 'w' ? 'd1' : 'd8';

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'k', color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      animations.push({
        id: animationIdRef.current++,
        piece: { type: 'r', color: moveData.color },
        fromSquare: rookFrom,
        toSquare: rookTo,
      });
    } else {
      animations.push({
        id: animationIdRef.current++,
        piece: { type: moveData.piece, color: moveData.color },
        fromSquare: moveData.from,
        toSquare: moveData.to,
      });

      if (moveData.captured) {
        animations.push({
          id: animationIdRef.current++,
          piece: { type: moveData.captured, color: moveData.color === 'w' ? 'b' : 'w' },
          fromSquare: moveData.to,
          toSquare: moveData.to,
          captured: true,
        });
      }
    }

    setAnimatingPieces((prev) => [...prev, ...animations]);
  }, []);

  const removeAnimation = useCallback((animationId) => {
    setAnimatingPieces((prev) => prev.filter((anim) => anim.id !== animationId));
  }, []);

  const capturedPieces = useMemo(() => {
    const initial = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          current[piece.color][piece.type]++;
        }
      }
    }

    const captured = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      for (const piece of ['q', 'r', 'b', 'n', 'p']) {
        const diff = initial[color][piece] - current[color][piece];
        for (let i = 0; i < diff; i++) {
          captured[color].push(piece);
        }
      }
    }
    return captured;
  }, [game]);

  const resolvePromotion = useCallback((from, to, pieceType) => {
    if (pieceType !== 'p') return null;
    const promotionRank = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');
    if (!promotionRank) return null;

    if (settingsRef.current.autoQueen) {
      return 'q';
    }

    const selection = window.prompt('Promote to (q, r, b, n):', 'q');
    const choice = (selection || 'q').toLowerCase();
    if (['q', 'r', 'b', 'n'].includes(choice)) {
      return choice;
    }
    return 'q';
  }, []);

  const onSquareClick = useCallback(
    (square) => {
      if (game.turn() !== colorCode || game.isGameOver() || gameStatus !== 'playing') {
        return;
      }

      const piece = game.get(square);

      if (selectedSquare) {
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }

        const promotion = resolvePromotion(selectedSquare, square, game.get(selectedSquare)?.type);
        if (promotion === null && game.get(selectedSquare)?.type === 'p' && settingsRef.current.confirmMoves) {
          const proceed = window.confirm('Make this move?');
          if (!proceed) {
            setSelectedSquare(null);
            setPossibleMoves([]);
            return;
          }
        }

        const moveAttempt = {
          from: selectedSquare,
          to: square,
          promotion: promotion || 'q',
        };

        const gameCopy = buildGameFromHistory(moveHistory, game.fen());
        const move = gameCopy.move(moveAttempt);

        if (move) {
          triggerAnimation(move);

          setTimeout(() => {
            setGame(gameCopy);
            setMoveHistory(gameCopy.history({ verbose: true }));
            setSelectedSquare(null);
            setPossibleMoves([]);
            
            // Send move to server via socket
            socketService.makeMove(
              gameId,
              gameCopy.fen(),
              {
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                san: move.san,
              },
              toStoredMoveHistory(gameCopy.history({ verbose: true })),
              playerId
            );

            if (move.captured) {
              playSoundEffect(settingsRef.current, { type: 'capture' });
            } else {
              playSoundEffect(settingsRef.current, { type: 'move' });
            }

            if (gameCopy.inCheck()) {
              playSoundEffect(settingsRef.current, { type: 'check' });
            }

            if (gameCopy.isGameOver()) {
              handleGameOver(gameCopy);
            }
          }, 50);
          return;
        }
      }

      if (piece && piece.color === colorCode) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    },
    [game, colorCode, selectedSquare, gameId, playerId, gameStatus, triggerAnimation, resolvePromotion, moveHistory]
  );

  const onPieceDrop = useCallback(
    (sourceSquare, targetSquare) => {
      if (game.turn() !== colorCode || game.isGameOver() || gameStatus !== 'playing') {
        return false;
      }

      const gameCopy = buildGameFromHistory(moveHistory, game.fen());
      const promotion = resolvePromotion(sourceSquare, targetSquare, game.get(sourceSquare)?.type);
      if (promotion === null && game.get(sourceSquare)?.type === 'p' && settingsRef.current.confirmMoves) {
        const proceed = window.confirm('Make this move?');
        if (!proceed) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return false;
        }
      }

      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: promotion || 'q',
      });

      if (move === null) return false;

      triggerAnimation(move);

      setTimeout(() => {
        setGame(gameCopy);
        setMoveHistory(gameCopy.history({ verbose: true }));
        setSelectedSquare(null);
        setPossibleMoves([]);
        
        // Send move to server via socket
        socketService.makeMove(
          gameId,
          gameCopy.fen(),
          {
            from: move.from,
            to: move.to,
            promotion: move.promotion,
            san: move.san,
          },
          toStoredMoveHistory(gameCopy.history({ verbose: true })),
          playerId
        );

        if (move.captured) {
          playSoundEffect(settingsRef.current, { type: 'capture' });
        } else {
          playSoundEffect(settingsRef.current, { type: 'move' });
        }

        if (gameCopy.inCheck()) {
          playSoundEffect(settingsRef.current, { type: 'check' });
        }

        if (gameCopy.isGameOver()) {
          handleGameOver(gameCopy);
        }
      }, 50);

      return true;
    },
    [game, colorCode, gameId, playerId, gameStatus, triggerAnimation, resolvePromotion, moveHistory]
  );

  const handleGameOver = (chessGame) => {
    let result;
    let reason;

    if (chessGame.isCheckmate()) {
      result = chessGame.turn() === 'w' ? 'black' : 'white';
      reason = 'checkmate';
    } else if (chessGame.isStalemate()) {
      result = 'draw';
      reason = 'stalemate';
    } else if (chessGame.isDraw()) {
      result = 'draw';
      reason = 'draw';
    } else {
      return; // Not actually over
    }

    socketService.endGame(gameId, result, reason);
  };

  const handleResign = () => {
    if (window.confirm('Are you sure you want to resign? This will count as a loss.')) {
      socketService.resignGame(gameId, playerId);
    }
  };

  const handleOfferDraw = () => {
    socketService.offerDraw(gameId, playerId);
  };

  const handleRespondDraw = (accepted) => {
    socketService.respondDraw(gameId, playerId, accepted);
    setDrawOffered(false);
    setDrawOfferedBy(null);
  };

  const handleSendReaction = useCallback(
    (reaction) => {
      socketService.sendMessage(gameId, playerId, reaction);
    },
    [gameId, playerId]
  );

  const customSquareStyles = {};

  if (settings.highlightMoves) {
    if (selectedSquare) {
      customSquareStyles[selectedSquare] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
      };
    }

    possibleMoves.forEach((square) => {
      const piece = game.get(square);
      customSquareStyles[square] = {
        background: piece
          ? 'radial-gradient(circle, rgba(255, 0, 0, 0.4) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
  }

  if (game.inCheck()) {
    const kingSquare = findKingSquare(game, game.turn());
    if (kingSquare) {
      customSquareStyles[kingSquare] = {
        backgroundColor: 'rgba(255, 0, 0, 0.5)',
      };
    }
  }

  const isMyTurn = game.turn() === colorCode;
  const status = getGameStatusText;
  const canReview = status === 'checkmate'
    || endReason === 'resignation'
    || (gameStatus === 'ended' && winner && winner !== 'draw');

  // Top player is opponent, bottom is us
  const topPlayer = boardOrientation === 'white'
    ? { name: blackPlayer.name, avatar: '👤', rating: blackPlayer.elo || '???', isBot: false, color: 'b' }
    : { name: whitePlayer.name, avatar: '👤', rating: whitePlayer.elo || '???', isBot: false, color: 'w' };

  const bottomPlayer = boardOrientation === 'white'
    ? { name: whitePlayer.name, avatar: '👤', rating: whitePlayer.elo || '???', isBot: false, color: 'w' }
    : { name: blackPlayer.name, avatar: '👤', rating: blackPlayer.elo || '???', isBot: false, color: 'b' };

  const getStatusMessage = () => {
    if (gameStatus === 'ended') {
      if (endReason === 'resignation') {
        const winnerName = winner === 'white' ? 'White' : 'Black';
        const winnerColor = winner === 'white' ? 'w' : 'b';
        return (
          <>
            <ChessPieceIcon piece="K" color={winnerColor} size={20} /> {winnerName} wins by resignation!
          </>
        );
      }
      if (opponentStatus === 'disconnected') {
        return '🚪 Opponent disconnected';
      }
      if (winner === 'draw') {
        return '½-½ Draw!';
      }
    }
    if (status === 'checkmate') {
      const checkmateWinner = game.turn() === 'w' ? 'Black' : 'White';
      const winnerColor = game.turn() === 'w' ? 'b' : 'w';
      return (
        <>
          <ChessPieceIcon piece="K" color={winnerColor} size={20} /> {checkmateWinner} wins by checkmate!
        </>
      );
    }
    if (status === 'stalemate') return '½-½ Stalemate!';
    if (status === 'draw') return '½-½ Draw!';
    if (status === 'check') {
      return (
        <>
          <ChessPieceIcon piece="K" color={game.turn()} size={20} /> {game.turn() === 'w' ? 'White' : 'Black'} is in check!
        </>
      );
    }
    if (isMyTurn) return '🎯 Your turn';
    return "⏳ Opponent's turn";
  };

  return (
    <div className="online-chess-game">
      <div className="game-container">
        <div className="board-section">
          <PlayerBar
            {...topPlayer}
            isActive={game.turn() === (boardOrientation === 'white' ? 'b' : 'w')}
            capturedPieces={capturedPieces[topPlayer.color === 'w' ? 'b' : 'w']}
          />
          <div className="board-wrapper">
            <ChessBoard
              position={game}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              customSquareStyles={customSquareStyles}
              showCoordinates={settings.showCoordinates}
              boardTheme={settings.boardTheme}
            />
            {animatingPieces.map((anim) => (
              <AnimatedPiece
                key={anim.id}
                piece={anim.piece}
                fromSquare={anim.fromSquare}
                toSquare={anim.toSquare}
                boardOrientation={boardOrientation}
                captured={anim.captured}
                onComplete={() => removeAnimation(anim.id)}
              />
            ))}
            {incomingReaction && (
              <div className="incoming-reaction">{incomingReaction}</div>
            )}
            {showVictory && (
              <div className="victory-burst" role="status" aria-live="polite">
                <span className="victory-spark" />
                <span className="victory-text">Checkmate!</span>
              </div>
            )}
          </div>
          <PlayerBar
            {...bottomPlayer}
            isActive={game.turn() === (boardOrientation === 'white' ? 'w' : 'b')}
            capturedPieces={capturedPieces[bottomPlayer.color === 'w' ? 'b' : 'w']}
          />
        </div>

        <div className="sidebar">
          <div className="online-game-info">
            <div className="game-code-display">
              <span className="label">Game Code</span>
              <span className="code">{gameId}</span>
            </div>
            <div className={`opponent-status ${opponentStatus}`}>
              <span className="status-dot"></span>
              <span>Opponent {opponentStatus}</span>
            </div>
            {eloChange !== null && (
              <div className="elo-change">
                Rating: {eloChange > 0 ? '+' : ''}{eloChange}
              </div>
            )}
          </div>

          <div className="game-status-panel">
            {moveError && (
              <div className="error-message">{moveError}</div>
            )}
            <div className={`status-message ${status}`}>{getStatusMessage()}</div>
            <div className="player-color">
              You play as: <ChessPieceIcon piece="K" color={playerColor === 'white' ? 'w' : 'b'} size={18} /> {playerColor === 'white' ? 'White' : 'Black'}
            </div>
          </div>

          {drawOffered && (
            <div className="draw-offer-panel">
              <p>Opponent offers a draw</p>
              <div className="draw-buttons">
                <button onClick={() => handleRespondDraw(true)} className="btn btn-primary">
                  Accept
                </button>
                <button onClick={() => handleRespondDraw(false)} className="btn btn-secondary">
                  Decline
                </button>
              </div>
            </div>
          )}

          <div className="reactions-panel">
            <span className="reactions-label">Quick Reactions</span>
            <div className="reactions-grid">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction}
                  className="reaction-btn"
                  onClick={() => handleSendReaction(reaction)}
                >
                  {reaction}
                </button>
              ))}
            </div>
          </div>

          <MoveHistory history={moveHistory} />

          <div className="online-controls">
            {gameStatus === 'playing' && (
              <>
                <button onClick={handleOfferDraw} className="btn btn-secondary" disabled={drawOffered}>
                  🤝 Offer Draw
                </button>
                <button onClick={handleResign} className="btn btn-danger">
                  🏳️ Resign
                </button>
              </>
            )}
            <button
              onClick={() => navigate(`/analysis/${gameId}`, { state: { moveHistory } })}
              className="btn btn-primary"
              disabled={!canReview}
            >
              🧠 Game Review
            </button>
            <button onClick={onLeave} className="btn btn-danger">
              🚪 Leave Game
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
