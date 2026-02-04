import { query } from '../db.js';
import { Chess } from 'chess.js';

const userIdFromPlayerId = (playerId) => {
  if (typeof playerId === 'number' && Number.isInteger(playerId)) {
    return playerId > 0 ? playerId : null;
  }

  if (typeof playerId !== 'string') return null;

  if (/^\d+$/.test(playerId)) {
    const parsed = Number(playerId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const match = playerId.match(/^user_(\d+)(?:_.+)?$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const hasValidEloPair = (game) =>
  typeof game?.white_elo === 'number'
  && Number.isFinite(game.white_elo)
  && typeof game?.black_elo === 'number'
  && Number.isFinite(game.black_elo);

const buildPlayerMoveHistory = (moveHistory, isWhite) => {
  if (!Array.isArray(moveHistory)) return [];
  const parity = isWhite ? 0 : 1;
  return moveHistory.filter((_, index) => index % 2 === parity);
};

const resolveMatchMoveOwner = (game, socketId, playerId) => {
  if (!game) return { username: null, isWhite: null };

  if (socketId && game.white_socket_id === socketId) {
    return { username: game.white_player_name, isWhite: true };
  }

  if (socketId && game.black_socket_id === socketId) {
    return { username: game.black_player_name, isWhite: false };
  }

  if (playerId && game.white_player_id === playerId) {
    return { username: game.white_player_name, isWhite: true };
  }

  if (playerId && game.black_player_id === playerId) {
    return { username: game.black_player_name, isWhite: false };
  }

  return { username: null, isWhite: null };
};

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

// Game service class
class GameService {
  constructor(io) {
    this.io = io;
  }

  async getGame(gameId) {
    try {
      const result = await query(
        'SELECT * FROM active_games WHERE game_id = $1',
        [gameId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error getting game:', error);
      return null;
    }
  }

  async getGameForSocket(socketId) {
    try {
      const result = await query(
        `SELECT * FROM active_games
         WHERE white_socket_id = $1 OR black_socket_id = $1`,
        [socketId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error getting game for socket:', error);
      return null;
    }
  }

  async updateGameState(gameId, fen, lastMove, moveHistory) {
    try {
      const result = await query(
        `UPDATE active_games 
         SET fen = $1, move_history = $2, updated_at = CURRENT_TIMESTAMP
         WHERE game_id = $3
         RETURNING *`,
        [fen, moveHistory, gameId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error updating game state:', error);
      return null;
    }
  }

  async updateGameStatus(gameId, status) {
    try {
      const result = await query(
        `UPDATE active_games 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE game_id = $2
         RETURNING *`,
        [status, gameId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error updating game status:', error);
      return null;
    }
  }

  async endGame(gameId, result) {
    try {
      const gameResult = await query(
        `UPDATE active_games
         SET status = 'ended', updated_at = CURRENT_TIMESTAMP
         WHERE game_id = $1
         RETURNING *`,
        [gameId]
      );

      if (gameResult.rows.length > 0) {
        const game = gameResult.rows[0];
        const whiteUserId = userIdFromPlayerId(game.white_player_id);
        const blackUserId = userIdFromPlayerId(game.black_player_id);

        // Store completed game in games table
        await query(
          `INSERT INTO games (
            game_code, white_player_id, black_player_id,
            white_player_name, black_player_name, result,
            fen, move_history, status, game_mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (game_code)
          DO UPDATE SET
            white_player_id = EXCLUDED.white_player_id,
            black_player_id = EXCLUDED.black_player_id,
            white_player_name = EXCLUDED.white_player_name,
            black_player_name = EXCLUDED.black_player_name,
            result = EXCLUDED.result,
            fen = EXCLUDED.fen,
            move_history = EXCLUDED.move_history,
            status = EXCLUDED.status,
            game_mode = EXCLUDED.game_mode,
            updated_at = CURRENT_TIMESTAMP`,
          [
            game.game_id,
            whiteUserId,
            blackUserId,
            game.white_player_name,
            game.black_player_name,
            result,
            game.fen,
            game.move_history,
            'completed',
            game.game_mode
          ]
        );

        if (game.game_mode === 'ranked') {
          // Update player ELOs
          await this.updatePlayerElos(game, result);
        }
      }

      return gameResult.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error ending game:', error);
      return null;
    }
  }

  async updatePlayerElos(game, result) {
    if (!hasValidEloPair(game)) {
      console.warn('[Game] Missing ELOs for ranked game; skipping ELO update.');
      return;
    }

    const whiteUserId = userIdFromPlayerId(game.white_player_id);
    const blackUserId = userIdFromPlayerId(game.black_player_id);

    if (!whiteUserId || !blackUserId) {
      console.warn('[Game] Missing user IDs for ranked game; skipping ELO update.');
      return;
    }
    if (whiteUserId === blackUserId) {
      console.warn('[Game] Same user matched on both sides; skipping ELO update.');
      return;
    }

    // ELO calculation using standard formula
    const calculateNewElo = (playerElo, opponentElo, score) => {
      const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
      return Math.round(playerElo + 32 * (score - expectedScore));
    };

    try {
      let whiteScore, blackScore;

      if (result === 'white') {
        whiteScore = 1;
        blackScore = 0;
      } else if (result === 'black') {
        whiteScore = 0;
        blackScore = 1;
      } else {
        whiteScore = 0.5;
        blackScore = 0.5;
      }

      const newWhiteElo = calculateNewElo(game.white_elo, game.black_elo, whiteScore);
      const newBlackElo = calculateNewElo(game.black_elo, game.white_elo, blackScore);

      // Update in database if they have user accounts (convert to integer for query)
      if (whiteUserId) {
        await query(
          `UPDATE users
           SET elo = $1, games_played = games_played + 1,
               wins = wins + $2, losses = losses + $3, draws = draws + $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            newWhiteElo,
            result === 'white' ? 1 : 0,
            result === 'black' ? 1 : 0,
            result === 'draw' ? 1 : 0,
            whiteUserId
          ]
        );
      }

      if (blackUserId) {
        await query(
          `UPDATE users
           SET elo = $1, games_played = games_played + 1,
               wins = wins + $2, losses = losses + $3, draws = draws + $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            newBlackElo,
            result === 'black' ? 1 : 0,
            result === 'white' ? 1 : 0,
            result === 'draw' ? 1 : 0,
            blackUserId
          ]
        );
      }

      // Notify players of ELO changes
      if (game.white_socket_id) {
        this.io.to(game.white_socket_id).emit('elo_updated', {
          newElo: newWhiteElo,
          change: newWhiteElo - game.white_elo
        });
      }

      if (game.black_socket_id) {
        this.io.to(game.black_socket_id).emit('elo_updated', {
          newElo: newBlackElo,
          change: newBlackElo - game.black_elo
        });
      }
    } catch (error) {
      console.error('[Game] Error updating player ELOs:', error);
    }
  }

  async getGameForSocket(socketId) {
    try {
      const result = await query(
        `SELECT * FROM active_games 
         WHERE white_socket_id = $1 OR black_socket_id = $1`,
        [socketId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Game] Error getting game for socket:', error);
      return null;
    }
  }
}

// Export singleton instance
let gameService = null;

export function getGameService(io) {
  if (!gameService) {
    gameService = new GameService(io);
  }
  return gameService;
}

// Socket.io event handlers
export function setupGameHandlers(io, socket) {
  const service = getGameService(io);

  socket.on('join_game', async (data) => {
    // Validate input data
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string' || gameId.length < 4) {
      socket.emit('game_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
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

    // Join the socket room for this game
    socket.join(gameId);

    // Send current game state
    socket.emit('game_state', {
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

    // Notify other player
    socket.to(gameId).emit('player_joined', {
      playerId,
      timestamp: Date.now()
    });
  });

  socket.on('make_move', async (data) => {
    // Validate input data
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

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
      return;
    }

    // Validate move using chess.js - server-side validation to prevent cheating
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
      if (fen && fen !== newFen) {
        console.warn(`[Socket] FEN mismatch for game ${gameId}; using server history`);
      }

      const lastMoveText = typeof lastMove === 'string' ? lastMove : lastMove?.san || '';

      // Update game state in database with validated FEN
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
    
    // Broadcast move to all players in the game
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
    // Validate input data
    const { gameId, result, reason } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
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

    console.log(`[Socket] Game ${gameId} over: ${result} (${reason})`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
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
    // Validate input data
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    console.log(`[Socket] Player ${playerId} resigned game ${gameId}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
      return;
    }

    // Determine winner based on who resigned
    const winner = game.white_player_id === playerId ? 'black' : 'white';

    await service.endGame(gameId, winner);

    io.to(gameId).emit('game_ended', {
      gameId,
      result: winner,
      reason: 'resignation',
      timestamp: Date.now()
    });
  });

  socket.on('offer_draw', async (data) => {
    // Validate input data
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    console.log(`[Socket] Player ${playerId} offered draw in game ${gameId}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
      return;
    }

    // Notify other player
    socket.to(gameId).emit('draw_offered', {
      gameId,
      offeredBy: playerId,
      timestamp: Date.now()
    });
  });

  socket.on('respond_draw', async (data) => {
    // Validate input data
    const { gameId, playerId, accepted } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    if (typeof accepted !== 'boolean') {
      socket.emit('move_error', { message: 'Invalid accept parameter' });
      return;
    }

    console.log(`[Socket] Draw response in game ${gameId}: ${accepted}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
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
    // Validate input data
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

    console.log(`[Socket] Message in game ${gameId} by ${playerId}`);

    const game = await service.getGame(gameId);

    if (!game || game.status !== 'playing') {
      socket.emit('game_error', { message: 'Game not found or not active' });
      return;
    }

    // Session validation: Verify socket owns this game
    if (game.white_socket_id !== socket.id && game.black_socket_id !== socket.id) {
      socket.emit('move_error', { message: 'Unauthorized - not your game' });
      return;
    }

    // Broadcast message to all players
    io.to(gameId).emit('chat_message', {
      gameId,
      playerId,
      message,
      timestamp: Date.now()
    });
  });

  socket.on('leave_game', async (data) => {
    // Validate input data
    const { gameId, playerId } = data;

    if (!gameId || typeof gameId !== 'string') {
      socket.emit('move_error', { message: 'Invalid game ID' });
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      socket.emit('move_error', { message: 'Invalid player ID' });
      return;
    }

    console.log(`[Socket] Player ${playerId} leaving game ${gameId}`);

    socket.leave(gameId);

    // Notify other player
    socket.to(gameId).emit('player_left', {
      gameId,
      playerId,
      timestamp: Date.now()
    });
  });
}

export { GameService };
