import { query } from '../../db.js';
import { Chess } from 'chess.js';
import {
  verifyPlayerAuth,
  resolveMatchMoveOwner,
  buildPlayerMoveHistory,
  userIdFromPlayerId,
} from '../utils.js';
import { getGameService } from '../gameService.js';
import { censorMessage } from '../profanity.js';
import { getOnlineGameKv } from '../../kv/onlineGameKv.js';
import { sanitizeFairPlaySignals, withFairPlayMetadata } from '../../services/fairPlayTelemetry.js';

const drawOffers = new Map();
const DRAW_OFFER_TTL_MS = 10 * 60 * 1000;

function adjudicatePosition(chess) {
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
  if (chess.isStalemate()) return { result: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient_material' };
  if (chess.isFivefoldRepetition?.()) return { result: 'draw', reason: 'fivefold_repetition' };
  if (chess.isThreefoldRepetition?.()) return { result: 'draw', reason: 'threefold_repetition' };
  if (chess.isDrawByFiftyMoves?.()) return { result: 'draw', reason: 'fifty_moves' };
  return null;
}

const upsertMatchMoves = async ({ gameId, username, moveHistory, isWhite }) => {
  if (!gameId || !username || typeof isWhite !== 'boolean') return;
  const playerMoves = buildPlayerMoveHistory(moveHistory, isWhite);

  try {
    await query(
      `INSERT INTO match_moves (game_id, username, move_history)
       VALUES ($1, $2, $3)
       ON CONFLICT (game_id, username)
       DO UPDATE SET move_history = EXCLUDED.move_history, updated_at = CURRENT_TIMESTAMP`,
      [gameId, username, playerMoves]
    );
  } catch (error) {
    console.error('[Game] Error saving match moves:', error);
  }
};

export function setupGameHandlers(io, socket) {
  const service = getGameService(io);

  socket.on('join_game', async (data) => {
    const { gameId } = data || {};
    const authenticatedUserId = String(socket.data?.userId || '');

    if (!gameId || typeof gameId !== 'string' || gameId.length < 4) {
      socket.emit('game_error', { message: 'Invalid game ID' });
      return;
    }

    if (!authenticatedUserId) {
      socket.emit('game_error', { message: 'Authentication required' });
      return;
    }

    console.log(`[Socket] Authenticated player ${authenticatedUserId} joining game ${gameId}`);

    const game = await service.getGame(gameId);

    if (!game) {
      socket.emit('game_error', { message: 'Game not found' });
      return;
    }

    if (!['playing', 'waiting', 'ended'].includes(game.status)) {
      socket.emit('game_error', { message: 'Game is not available' });
      return;
    }

    const isWhitePlayer = String(userIdFromPlayerId(game.white_player_id) || '') === authenticatedUserId;
    const isBlackPlayer = String(userIdFromPlayerId(game.black_player_id) || '') === authenticatedUserId;
    const isParticipant = isWhitePlayer || isBlackPlayer;
    const participantPlayerId = isWhitePlayer ? game.white_player_id : isBlackPlayer ? game.black_player_id : null;

    // Authenticated participants may rejoin after refresh / reconnect.
    // Always re-bind their socket id so a new connection replaces the old one.
    // Spectators keep the previous spectator-style path.
    // Non-participants may spectate; only the authenticated account can claim a seat.

    if (isWhitePlayer && game.white_socket_id !== socket.id) {
      await query(
        `UPDATE active_games SET white_socket_id = $1, updated_at = CURRENT_TIMESTAMP WHERE game_id = $2`,
        [socket.id, gameId]
      );
      game.white_socket_id = socket.id;
    }

    if (isBlackPlayer && game.black_socket_id !== socket.id) {
      await query(
        `UPDATE active_games SET black_socket_id = $1, updated_at = CURRENT_TIMESTAMP WHERE game_id = $2`,
        [socket.id, gameId]
      );
      game.black_socket_id = socket.id;
    }

    socket.join(gameId);

    socket.emit('game_state', {
      role: isParticipant ? 'player' : 'spectator',
      gameId: game.game_id,
      fen: game.fen,
      moveHistory: game.move_history,
      status: game.status,
      whitePlayer: game.white_player_name,
      blackPlayer: game.black_player_name,
      whiteElo: game.white_elo,
      blackElo: game.black_elo,
      gameMode: game.game_mode
    });

    if (isParticipant) {
      socket.to(gameId).emit('player_joined', {
        playerId: participantPlayerId,
        timestamp: Date.now()
      });
    }
  });

  socket.on('make_move', async (data) => {
    const { gameId, fen, lastMove, moveHistory, fairPlaySignals } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { gameId: gameId || undefined, message: 'Invalid game ID' });
      return;
    }

    if (!moveHistory || !Array.isArray(moveHistory)) {
      socket.emit('move_error', { gameId, message: 'Invalid move history' });
      return;
    }

    console.log(`[Socket] Authenticated move request in game ${gameId} by ${socket.data?.userId}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('move_error', { gameId, message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('move_error', { gameId, message: auth.error });
      return;
    }
    const playerId = auth.playerId;

    const activeColor = game.fen && typeof game.fen === 'string'
      ? game.fen.trim().split(/\s+/)[1]
      : 'w';
    const expectedColor = activeColor === 'w' ? 'white' : 'black';

    if (auth.color !== expectedColor) {
      socket.emit('move_error', { gameId, message: 'Not your turn' });
      return;
    }

    const serverHistory = Array.isArray(game.move_history) ? game.move_history : [];
    const expectedMoveCount = Number.isInteger(game.move_count) ? game.move_count : serverHistory.length;
    const clientMoveCount = moveHistory.length;

    if (serverHistory.length > 500 || clientMoveCount !== serverHistory.length + 1) {
      socket.emit('move_error', { gameId, message: 'Stale or oversized move history' });
      return;
    }

    let chess;
    try {
      chess = new Chess(game.fen);

      const lastEntry = moveHistory[moveHistory.length - 1];
      let moveNotation = lastEntry;
      if (typeof lastEntry === 'string') {
        const trimmed = lastEntry.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { moveNotation = JSON.parse(trimmed); } catch { moveNotation = lastEntry; }
        }
      }
      if (moveNotation && typeof moveNotation === 'object') {
        if (moveNotation.from && moveNotation.to) {
          moveNotation = { from: moveNotation.from, to: moveNotation.to, promotion: moveNotation.promotion || 'q' };
        } else if (moveNotation.san) {
          moveNotation = moveNotation.san;
        }
      }

      const applied = chess.move(moveNotation);
      if (!applied) {
        socket.emit('move_error', { gameId, message: 'Illegal move' });
        return;
      }

      const canonicalMove = withFairPlayMetadata({
        san: applied.san, from: applied.from, to: applied.to,
        promotion: applied.promotion || null, captured: applied.captured || null,
        color: applied.color, piece: applied.piece,
      }, { playerId, signals: sanitizeFairPlaySignals(fairPlaySignals) });
      const newHistory = [...serverHistory, JSON.stringify(canonicalMove)];
      const casResult = await service.updateGameStateCAS(gameId, chess.fen(), newHistory, expectedMoveCount);
      if (!casResult) {
        socket.emit('move_error', { gameId, message: 'Stale move: state changed' });
        return;
      }

      const matchIdentity = resolveMatchMoveOwner(game, socket.id, playerId);
      await upsertMatchMoves({ gameId, username: matchIdentity.username, moveHistory: newHistory, isWhite: matchIdentity.isWhite });

      socket.emit('move_ack', { gameId, fen: chess.fen(), moveCount: expectedMoveCount + 1, playerId, lastMove: canonicalMove, timestamp: Date.now() });
      io.to(gameId).emit('move_made', { gameId, fen: chess.fen(), lastMove: canonicalMove, moveHistory: newHistory, playerId, timestamp: Date.now() });

      const outcome = adjudicatePosition(chess);
      if (outcome) {
        const endedGame = await service.endGame(gameId, outcome.result);
        if (endedGame) {
          drawOffers.delete(gameId);
          io.to(gameId).emit('game_ended', { gameId, result: outcome.result, reason: outcome.reason, timestamp: Date.now() });
        }
      }
    } catch (error) {
      console.error('[Socket] Chess validation error:', error);
      socket.emit('move_error', { gameId, message: 'Invalid move' });
    }
  });

  // Results are derived from the validated server position; client results are ignored.
  socket.on('game_over', () => {});

  socket.on('resign_game', async (data) => {
    const { gameId } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }
    const playerId = auth.playerId;

    const winner = auth.color === 'white' ? 'black' : 'white';

    const endedGame = await service.endGame(gameId, winner);
    if (!endedGame) return;

    io.to(gameId).emit('game_ended', {
      gameId,
      result: winner,
      reason: 'resignation',
      timestamp: Date.now()
    });
  });

  socket.on('offer_draw', async (data) => {
    const { gameId } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }
    const playerId = auth.playerId;

    drawOffers.set(gameId, { offeredBy: playerId, expiresAt: Date.now() + DRAW_OFFER_TTL_MS });
    socket.to(gameId).emit('draw_offered', {
      gameId,
      offeredBy: playerId,
      timestamp: Date.now()
    });
  });

  socket.on('respond_draw', async (data) => {
    const { gameId, accepted } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }
    const playerId = auth.playerId;

    if (typeof accepted !== 'boolean') {
      socket.emit('move_error', { gameId, message: 'Draw response must be boolean' });
      return;
    }
    const offer = drawOffers.get(gameId);
    if (!offer || offer.expiresAt < Date.now() || offer.offeredBy === playerId) {
      drawOffers.delete(gameId);
      socket.emit('move_error', { gameId, message: 'No active draw offer from your opponent' });
      return;
    }
    drawOffers.delete(gameId);
    if (accepted === true) {
      const endedGame = await service.endGame(gameId, 'draw');
      if (!endedGame) return;
      io.to(gameId).emit('game_ended', { gameId, result: 'draw', reason: 'agreement', timestamp: Date.now() });
    } else {
      io.to(gameId).emit('draw_declined', { gameId, declinedBy: playerId, timestamp: Date.now() });
    }
  });

  socket.on('send_message', async (data) => {
    const { gameId, message } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!message || typeof message !== 'string') {
      socket.emit('move_error', { message: 'Invalid message' });
      return;
    }

    if (message.length > 500) {
      socket.emit('move_error', { message: 'Message too long (max 500 characters)' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }
    const playerId = auth.playerId;

    const censoredMessage = censorMessage(message);
    io.to(gameId).emit('chat_message', {
      gameId,
      playerId,
      message: censoredMessage,
      timestamp: Date.now()
    });
  });

  socket.on('leave_game', async (data) => {
    const { gameId } = data || {};

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    const game = await service.getGame(gameId);
    if (!game) {
      socket.emit('game_error', { message: 'Game not found' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game);
    if (!auth.valid) {
      socket.emit('game_error', { message: auth.error });
      return;
    }
    const playerId = auth.playerId;
    const isWhitePlayer = game.white_player_id === playerId;
    const isBlackPlayer = game.black_player_id === playerId;

    const nextWhiteSocketId = isWhitePlayer ? null : game.white_socket_id;
    const nextBlackSocketId = isBlackPlayer ? null : game.black_socket_id;
    const bothPlayersGone = !nextWhiteSocketId && !nextBlackSocketId;
    const nextStatus = game.status;

    const updated = await query(
      `UPDATE active_games
       SET white_socket_id = CASE WHEN white_player_id = $2 THEN NULL ELSE white_socket_id END,
           black_socket_id = CASE WHEN black_player_id = $2 THEN NULL ELSE black_socket_id END,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE game_id = $1
       RETURNING *`,
      [gameId, playerId, nextStatus]
    );

    if (updated.rows[0]) {
      if (bothPlayersGone) {
        const outcome = adjudicatePosition(new Chess(updated.rows[0].fen));
        const endedGame = await service.endGame(gameId, outcome?.result || 'draw');
        drawOffers.delete(gameId);
        if (endedGame) io.to(gameId).emit('game_ended', { gameId, result: outcome?.result || 'draw', reason: outcome?.reason || 'both_players_left', timestamp: Date.now() });
      } else {
        await service.persistGameSnapshot(updated.rows[0], null, nextStatus);
      }
    }
    socket.leave(gameId);

    socket.to(gameId).emit('player_left', {
      gameId,
      playerId,
      linkClosed: bothPlayersGone,
      timestamp: Date.now()
    });
  });
}
