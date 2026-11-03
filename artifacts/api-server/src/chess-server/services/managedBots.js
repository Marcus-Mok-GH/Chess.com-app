import { Chess } from 'chess.js';
import { query, withTransaction } from '../db.js';
import { lockAccounts, findActiveGameForAccount } from './activeGameGuard.js';
import { applyMoveToClock, normalizeTimeControl } from './chessClock.js';
import { getGameService } from './gameService.js';
import { getOnlineGameKv } from '../kv/onlineGameKv.js';
import { computeManagedBotMove } from '../routes/engine.js';

export async function queueAvailableBot(timeControl, isRanked, humanId, humanElo) {
  const control = normalizeTimeControl(timeControl);
  const candidates = await query(
    `SELECT b.id, b.display_name, b.name, b.elo FROM bots b
     WHERE b.is_active = TRUE AND b.is_public = TRUE AND b.auto_join_matches = TRUE
       AND b.id <> $1 AND ABS(b.elo - $2) <= 500
     ORDER BY RANDOM() LIMIT 10`, [humanId, humanElo]
  );
  for (const bot of candidates.rows) {
    const queued = await withTransaction(async (client) => {
      await lockAccounts(client, [bot.id, humanId]);
      const human = await client.query('SELECT 1 FROM matchmaking_queue WHERE player_id = $1 AND last_heartbeat > NOW() - INTERVAL \'45 seconds\'', [humanId]);
      if (!human.rows.length || await findActiveGameForAccount(client, humanId)) return false;
      if (await findActiveGameForAccount(client, bot.id)) return false;
      const existing = await client.query('SELECT 1 FROM matchmaking_queue WHERE player_id = $1', [bot.id]);
      if (existing.rows.length) return false;
      await client.query(
        `INSERT INTO matchmaking_queue (socket_id, player_id, player_name, elo, is_ranked, time_control)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [`bot-${bot.id}`, bot.id, bot.display_name || bot.name, bot.elo, isRanked, control]
      );
      return true;
    });
    if (queued) return true;
  }
  return false;
}

export async function playManagedBotTurn(game) {
  if (game.status !== 'playing') return game;
  const side = game.fen?.split(' ')[1];
  if (side !== 'w' && side !== 'b') return game;
  const botId = side === 'w' ? game.white_player_id : game.black_player_id;
  const botResult = await query('SELECT id, elo FROM bots WHERE id = $1', [botId]);
  const bot = botResult?.rows?.[0];
  if (!bot) return game;
  let chess;
  try { chess = new Chess(game.fen); } catch { return game; }
  const moverColor = chess.turn() === 'w' ? 'white' : 'black';
  const clock = applyMoveToClock(game, moverColor);
  if (clock.flagged) {
    const ended = await getGameService().endGame(game.game_id, clock.flagged === 'white' ? 'black' : 'white');
    if (ended) await query("UPDATE active_games SET end_reason = 'timeout' WHERE game_id = $1 AND status = 'ended'", [game.game_id]);
    return (await query('SELECT * FROM active_games WHERE game_id = $1', [game.game_id])).rows[0] || game;
  }

  const uci = await computeManagedBotMove(game.fen, bot.elo);
  if (!uci) return game;
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  } catch {
    const fallback = chess.moves()[0];
    if (!fallback) return game;
    move = chess.move(fallback);
  }
  if (!move) return game;
  const history = [...(game.move_history || []), JSON.stringify({
    san: move.san, from: move.from, to: move.to, promotion: move.promotion,
    captured: move.captured || null, color: move.color, piece: move.piece,
  })];
  const count = Number(game.move_count) || 0;
  const currentClock = applyMoveToClock(game, moverColor);
  if (currentClock.flagged) {
    const ended = await getGameService().endGame(game.game_id, currentClock.flagged === 'white' ? 'black' : 'white');
    if (ended) await query("UPDATE active_games SET end_reason = 'timeout' WHERE game_id = $1 AND status = 'ended'", [game.game_id]);
    return (await query('SELECT * FROM active_games WHERE game_id = $1', [game.game_id])).rows[0] || game;
  }
  const updated = await query(
    `UPDATE active_games SET fen = $1, move_history = $2, move_count = move_count + 1,
       white_time_ms = $5, black_time_ms = $6, clock_running_since = $7,
       updated_at = CURRENT_TIMESTAMP
     WHERE game_id = $3 AND move_count = $4 AND status = 'playing' RETURNING *`,
    [chess.fen(), history, game.game_id, count, currentClock.whiteMs, currentClock.blackMs, currentClock.runningSince]
  );
  if (!updated.rows[0]) return (await query('SELECT * FROM active_games WHERE game_id = $1', [game.game_id])).rows[0] || game;
  const saved = updated.rows[0];
  const winner = chess.isCheckmate() ? (move.color === 'w' ? 'white' : 'black') : chess.isDraw() ? 'draw' : null;
  if (winner) {
    const ended = await getGameService().endGame(game.game_id, winner);
    if (ended) await query('UPDATE active_games SET end_reason = $2 WHERE game_id = $1 AND status = $3',
      [game.game_id, chess.isCheckmate() ? 'checkmate' : 'draw', 'ended']);
  } else {
    await getGameService().persistGameSnapshot(saved, null, 'active');
    await getOnlineGameKv().set(game.game_id, saved);
  }
  try {
    await query('INSERT INTO bot_activity (bot_id, activity_type, game_id, metadata) VALUES ($1, $2, $3, $4)',
      [bot.id, 'move', game.game_id, JSON.stringify({ move: move.san })]);
  } catch (error) {
    console.error('[ManagedBots] Failed to log move:', error);
  }
  return winner ? (await query('SELECT * FROM active_games WHERE game_id = $1', [game.game_id])).rows[0] || saved : saved;
}
