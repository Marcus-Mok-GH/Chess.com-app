import { query } from '../db.js';
import { userIdFromPlayerId, hasValidEloPair } from './utils.js';

export class GameService {
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
}

let gameServiceInstance = null;

export function getGameService(io) {
  if (!gameServiceInstance) {
    gameServiceInstance = new GameService(io);
  }
  return gameServiceInstance;
}
