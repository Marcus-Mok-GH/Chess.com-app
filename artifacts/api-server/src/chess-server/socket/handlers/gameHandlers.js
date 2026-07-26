import { query } from '../../db.js';
import { Chess } from 'chess.js';
import {
  verifyPlayerAuth,
  resolveMatchMoveOwner,
  buildPlayerMoveHistory
} from '../utils.js';
import { getGameService } from '../gameService.js';
import { censorMessage } from '../profanity.js';
import { getOnlineGameKv } from '../../kv/onlineGameKv.js';

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
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string' || gameId.length < 4) {
      socket.emit('game_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string' || playerId.trim().length === 0) {
      socket.emit('game_error', { message: 'Invalid player ID' });
      return;
    }

    console.log(`[Socket] Player ${playerId} joining game ${gameId}`);

    const game = await service.getGame(gameId);

    if (!game) {
      socket.emit('game_error', { message: 'Game not found' });
      return;
    }

    if (!['playing', 'waiting', 'ended'].includes(game.status)) {
      socket.emit('game_error', { message: 'Game is not available' });
      return;
    }

    const isWhitePlayer = game.white_player_id === playerId;
    const isBlackPlayer = game.black_player_id === playerId;
    const isParticipant = isWhitePlayer || isBlackPlayer;

    // Authenticated participants may rejoin after refresh / reconnect.
    // Always re-bind their socket id so a new connection replaces the old one.
    // Spectators keep the previous spectator-style path.
    if (!isParticipant) {
      // Non-participants can only spectate; block if they try to claim a seat
      if (game.white_socket_id === socket.id && game.white_player_id && game.white_player_id !== playerId) {
        socket.emit('game_error', { message: 'Player ID mismatch' });
        return;
      }
      if (game.black_socket_id === socket.id && game.black_player_id && game.black_player_id !== playerId) {
        socket.emit('game_error', { message: 'Player ID mismatch' });
        return;
      }
    }

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
        playerId,
        timestamp: Date.now()
      });
    }
  });

  socket.on('make_move', async (data) => {
    const { gameId, fen, lastMove, moveHistory, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { gameId: gameId || undefined, message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { gameId, message: 'Invalid player ID' });
      return;
    }

    if (!moveHistory || !Array.isArray(moveHistory)) {
      socket.emit('move_error', { gameId, message: 'Invalid move history' });
      return;
    }

    console.log(`[Socket] Move in game ${gameId} by ${playerId}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('move_error', { gameId, message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { gameId, message: auth.error });
      return;
    }

    const activeColor = game.fen && typeof game.fen === 'string'
      ? game.fen.trim().split(/\s+/)[1]
      : 'w';
    const expectedColor = activeColor === 'w' ? 'white' : 'black';

    if (auth.color !== expectedColor) {
      socket.emit('move_error', { gameId, message: 'Not your turn' });
      return;
    }

    const serverHistory = Array.isArray(game.move_history) ? game.move_history : [];
    const expectedMoveCount = game.move_count || 0;
    const clientMoveCount = moveHistory.length;

    if (clientMoveCount !== serverHistory.length + 1) {
      socket.emit('move_error', { gameId, message: 'Stale move: history out of sync' });
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

      const casResult = await service.updateGameStateCAS(gameId, chess.fen(), moveHistory, expectedMoveCount);
      if (!casResult) {
        socket.emit('move_error', { gameId, message: 'Stale move: state changed' });
        return;
      }

      const matchIdentity = resolveMatchMoveOwner(game, socket.id, playerId);
      await upsertMatchMoves({
        gameId,
        username: matchIdentity.username,
        moveHistory,
        isWhite: matchIdentity.isWhite
      });

      socket.emit('move_ack', {
        gameId,
        fen: chess.fen(),
        moveCount: expectedMoveCount + 1,
        playerId,
        timestamp: Date.now()
      });

      io.to(gameId).emit('move_made', {
        gameId,
        fen: chess.fen(),
        lastMove,
        moveHistory,
        playerId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[Socket] Chess validation error:', error);
      socket.emit('move_error', { gameId, message: 'Invalid move' });
    }
  });

  socket.on('game_over', async (data) => {
    const { gameId, result, reason, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    if (!result || !['white', 'black', 'draw'].includes(result)) {
      socket.emit('move_error', { message: 'Invalid result' });
      return;
    }

    if (!reason || typeof reason !== 'string') {
      socket.emit('move_error', { message: 'Invalid reason' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    await service.endGame(gameId, result);

    io.to(gameId).emit('game_ended', {
      gameId,
      result,
      reason,
      timestamp: Date.now()
    });
  });

  socket.on('resign_game', async (data) => {
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    const winner = auth.color === 'white' ? 'black' : 'white';

    await service.endGame(gameId, winner);

    io.to(gameId).emit('game_ended', {
      gameId,
      result: winner,
      reason: 'resignation',
      timestamp: Date.now()
    });
  });

  socket.on('offer_draw', async (data) => {
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    socket.to(gameId).emit('draw_offered', {
      gameId,
      offeredBy: playerId,
      timestamp: Date.now()
    });
  });

  socket.on('respond_draw', async (data) => {
    const { gameId, playerId, accepted } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    if (accepted) {
      await service.endGame(gameId, 'draw');

      io.to(gameId).emit('game_ended', {
        gameId,
        result: 'draw',
        reason: 'agreement',
        timestamp: Date.now()
      });
    } else {
      io.to(gameId).emit('draw_declined', {
        gameId,
        declinedBy: playerId,
        timestamp: Date.now()
      });
    }
  });

  socket.on('send_message', async (data) => {
    const { gameId, playerId, message } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
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

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    const censoredMessage = censorMessage(message);
    io.to(gameId).emit('chat_message', {
      gameId,
      playerId,
      message: censoredMessage,
      timestamp: Date.now()
    });
  });

  socket.on('leave_game', async (data) => {
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    const game = await service.getGame(gameId);
    if (!game) {
      socket.emit('game_error', { message: 'Game not found' });
      return;
    }

    const isWhitePlayer = game.white_player_id === playerId;
    const isBlackPlayer = game.black_player_id === playerId;
    if (!isWhitePlayer && !isBlackPlayer) {
      socket.emit('game_error', { message: 'Unauthorized - not your game' });
      return;
    }

    const nextWhiteSocketId = isWhitePlayer ? null : game.white_socket_id;
    const nextBlackSocketId = isBlackPlayer ? null : game.black_socket_id;
    const bothPlayersGone = !nextWhiteSocketId && !nextBlackSocketId;
    const nextStatus = bothPlayersGone ? 'ended' : game.status;

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
      await service.persistGameSnapshot(
        updated.rows[0],
        null,
        nextStatus === 'ended' ? 'completed' : nextStatus
      );

      if (bothPlayersGone || nextStatus === 'ended') {
        const kv = getOnlineGameKv();
        kv.del(gameId);
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
