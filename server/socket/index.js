import { query } from '../db.js';

export async function registerSocketHandlers(io, socket) {
  try {
    const { setupMatchmakingHandlers } = await import('./matchmaking.js');
    const { setupGameHandlers } = await import('./game.js');

    setupMatchmakingHandlers(io, socket);
    setupGameHandlers(io, socket);
  } catch (error) {
    console.error('[Socket] Error setting up handlers:', error);
  }

  socket.on('disconnect', async (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id}, reason: ${reason}`);

    try {
      await query('DELETE FROM matchmaking_queue WHERE socket_id = $1', [socket.id]);

      const activeGames = await query(
        `SELECT * FROM active_games WHERE white_socket_id = $1 OR black_socket_id = $1`,
        [socket.id]
      );

      for (const game of activeGames.rows) {
        if (game.status === 'playing') {
          const otherSocketId = game.white_socket_id === socket.id
            ? game.black_socket_id
            : game.white_socket_id;

          if (otherSocketId) {
            io.to(otherSocketId).emit('opponent_disconnected', {
              gameId: game.game_id,
              reason: 'Player disconnected'
            });
          }

          await query(
            'UPDATE active_games SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE game_id = $2',
            ['disconnected', game.game_id]
          );
        }
      }
    } catch (error) {
      console.error('[Socket] Error handling disconnect:', error);
    }
  });
}
