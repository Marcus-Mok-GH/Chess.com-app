import { query } from '../../db.js';
import { Chess } from 'chess.js';
import {
  verifyPlayerAuth,
  resolveMatchMoveOwner,
  buildPlayerMoveHistory
} from '../utils.js';
import { getGameService } from '../gameService.js';

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

    if (game.status !== 'playing' && game.status !== 'waiting') {
      socket.emit('game_error', { message: 'Game is not active' });
      return;
    }

    const isWhitePlayer = game.white_player_id === playerId;
    const isBlackPlayer = game.black_player_id === playerId;
    const isParticipant = isWhitePlayer || isBlackPlayer;

    if (isWhitePlayer && game.white_socket_id && game.white_socket_id !== socket.id) {
      socket.emit('game_error', { message: 'Unauthorized - not your game' });
      return;
    }

    if (isBlackPlayer && game.black_socket_id && game.black_socket_id !== socket.id) {
      socket.emit('game_error', { message: 'Unauthorized - not your game' });
      return;
    }

    if (game.white_socket_id === socket.id && game.white_player_id && game.white_player_id !== playerId) {
      socket.emit('game_error', { message: 'Player ID mismatch' });
      return;
    }

    if (game.black_socket_id === socket.id && game.black_player_id && game.black_player_id !== playerId) {
      socket.emit('game_error', { message: 'Player ID mismatch' });
      return;
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
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    if (!fen || typeof fen !== 'string') {
      socket.emit('move_error', { message: 'Invalid FEN string' });
      return;
    }

    if (!lastMove || (typeof lastMove !== 'string' && typeof lastMove !== 'object')) {
      socket.emit('move_error', { message: 'Invalid move data' });
      return;
    }

    if (!moveHistory || !Array.isArray(moveHistory)) {
      socket.emit('move_error', { message: 'Invalid move history' });
      return;
    }

    console.log(`[Socket] Move in game ${gameId} by ${playerId}: ${lastMove}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('move_error', { message: 'Game not found or not active' });
      return;
    }

    const auth = verifyPlayerAuth(socket, game, playerId);
    if (!auth.valid) {
      socket.emit('move_error', { message: auth.error });
      return;
    }

    const activeColor = game.fen && typeof game.fen === 'string'
      ? game.fen.trim().split(/\s+/)[1]
      : 'w';
    const expectedColor = activeColor === 'w' ? 'white' : 'black';

    if (auth.color !== expectedColor) {
      socket.emit('move_error', { message: 'Not your turn' });
      return;
    }

    let chess;
    try {
      chess = new Chess();

      for (const entry of moveHistory) {
        let parsedEntry = entry;
        if (typeof parsedEntry === 'string') {
          const trimmed = parsedEntry.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              parsedEntry = JSON.parse(trimmed);
            } catch {
              parsedEntry = entry;
            }
          }
        }

        let moveNotation = parsedEntry;
        if (parsedEntry && typeof parsedEntry === 'object') {
          if (parsedEntry.from && parsedEntry.to) {
            moveNotation = {
              from: parsedEntry.from,
              to: parsedEntry.to,
              promotion: parsedEntry.promotion || 'q',
            };
          } else if (parsedEntry.san) {
            moveNotation = parsedEntry.san;
          }
        }

        const applied = chess.move(moveNotation);
        if (!applied) {
          console.log(`[Socket] Invalid move detected in game ${gameId}: ${JSON.stringify(moveNotation)}`);
          socket.emit('move_error', { message: 'Invalid move' });
          return;
        }
      }

      const newFen = chess.fen();
      const lastMoveText = typeof lastMove === 'string' ? lastMove : lastMove?.san || '';

      await service.updateGameState(gameId, newFen, lastMoveText, moveHistory);

      const matchIdentity = resolveMatchMoveOwner(game, socket.id, playerId);
      await upsertMatchMoves({
        gameId,
        username: matchIdentity.username,
        moveHistory,
        isWhite: matchIdentity.isWhite
      });
    } catch (error) {
      console.error('[Socket] Chess validation error:', error);
      socket.emit('move_error', { message: 'Invalid move or FEN' });
      return;
    }

    io.to(gameId).emit('move_made', {
      gameId,
      fen: chess.fen(),
      lastMove,
      moveHistory,
      playerId,
      timestamp: Date.now()
    });
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

    io.to(gameId).emit('chat_message', {
      gameId,
      playerId,
      message,
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

    socket.leave(gameId);

    socket.to(gameId).emit('player_left', {
      gameId,
      playerId,
      timestamp: Date.now()
    });
  });
}
