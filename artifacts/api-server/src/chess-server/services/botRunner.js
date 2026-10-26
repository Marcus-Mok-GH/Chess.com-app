/**
 * Bot Runner Service — runs bots that behave like human players.
 * 
 * Each active bot runs a loop that:
 * 1. Joins matchmaking queue
 * 2. When matched, plays the game (makes moves via engine API)
 * 3. Chats during the game (using LLM)
 * 4. After game, may create/join communities
 * 5. Repeats
 */

import { Chess } from 'chess.js';
import { query } from '../db.js';
import { spawn } from 'node:child_process';

const ENGINE_PATH = process.env.STOCKFISH_PATH || '/usr/games/stockfish';

const DEFAULT_MODEL = 'gpt-4o-mini';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function weightedRandom(weights) {
  // weights: { 'choice1': 0.3, 'choice2': 0.7 }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

async function getEngineMove(fen, depth = 12, nodes = 100000) {
  return new Promise((resolve, reject) => {
    const engine = spawn(ENGINE_PATH);
    let output = '';
    let errorOutput = '';

    engine.stdout.on('data', (data) => {
      output += data.toString();
    });
    engine.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    engine.on('close', (code) => {
      if (code !== 0 && errorOutput) {
        return reject(new Error(`Stockfish exited with code ${code}: ${errorOutput}`));
      }
      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('bestmove')) {
          const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
          if (match) return resolve(match[1]);
        }
      }
      reject(new Error('No bestmove found in engine output'));
    });

    engine.on('error', reject);

    const commands = [
      'uci',
      `position fen ${fen}`,
      `go depth ${depth} nodes ${nodes}`,
    ];
    engine.stdin.write(commands.join('\n') + '\n');
    engine.stdin.end();
  });
}

async function callPollinations(prompt, systemPrompt, model = DEFAULT_MODEL) {
  // Use the existing coachAI/pollinations pattern
  // The Pollinations API is called via the coach endpoint
  try {
    // For now, we'll use a simple fetch to a generic LLM endpoint
    // In production this would use the configured Pollinations connector
    const response = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Pollinations error: ${response.status}`);
    return await response.text();
  } catch (e) {
    console.error('[BotRunner] Pollinations call failed:', e.message);
    // Fallback to simple responses
    return getFallbackChat(systemPrompt);
  }
}

function getFallbackChat(systemPrompt) {
  const fallbacks = [
    'Good game!',
    'Nice move.',
    'I didn\'t see that coming.',
    'Well played.',
    'That was tricky.',
    'GG!',
    'You\'re good.',
    'Rematch?',
    'Almost had me there.',
    'Lucky escape.',
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function getPersonaPrompt(bot) {
  const base = `You are ${bot.name} (${bot.avatar}), a chess-playing bot with personality.
ELO: ${bot.elo}. Play style: ${bot.play_style}.
Personality: ${bot.personality || 'A chess enthusiast.'}
System prompt: ${bot.system_prompt || 'Play naturally and chat like a human.'}

Guidelines:
- Keep responses SHORT (1-2 sentences max)
- Sound human, not robotic
- React naturally to game events
- Use your personality traits
- Don't explain moves, just chat
- Occasional typos or casual language is fine
- Never reveal you are an AI/bot`;
  return base;
}

async function generateChatMessage(bot, gameState, context) {
  const prompt = `${getPersonaPrompt(bot)}

Game context: ${context}
Current position: ${gameState.fen}
Your color: ${gameState.color}
Move number: ${gameState.moveNumber}
Your time: ${gameState.myTime}ms | Opponent time: ${gameState.oppTime}ms
Last move: ${gameState.lastMove || 'none'}
Game result: ${gameState.result || 'ongoing'}

Generate a brief, natural chat message (max 160 chars):`;

  return await callPollinations(prompt, bot.system_prompt, bot.model);
}

async function generateCommunityIdea(bot) {
  const prompt = `${getPersonaPrompt(bot)}

You're thinking about creating a chess community/club. 
Suggest a creative club name, description, and focus (max 200 chars total).
Format: NAME | DESCRIPTION | FOCUS`;

  return await callPollinations(prompt, bot.system_prompt, bot.model);
}

async function createBotUser(bot) {
  // Ensure the bot has a user account
  const existing = await query('SELECT id FROM users WHERE id = $1', [bot.id]);
  if (existing.rowCount > 0) {
    return bot.id;
  }

  // Create user account for bot
  await query(
    `INSERT INTO users (id, username, email, elo, avatar, is_bot, created_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET elo = $4, avatar = $5`,
    [bot.id, bot.name, `bot-${bot.id}@chess.local`, bot.elo, bot.avatar]
  );
  return bot.id;
}

async function joinMatchmaking(botId, botName, elo, timeControl = '10+0') {
  try {
    const result = await query(
      `INSERT INTO matchmaking_queue (player_id, player_name, elo, time_control, joined_at, last_heartbeat)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (player_id) DO UPDATE SET
         player_name = $2, elo = $3, time_control = $4, last_heartbeat = CURRENT_TIMESTAMP
       RETURNING *`,
      [botId, botName, elo, timeControl]
    );
    return result.rows[0];
  } catch (e) {
    console.error('[BotRunner] Failed to join matchmaking:', e.message);
    return null;
  }
}

async function leaveMatchmaking(botId) {
  await query('DELETE FROM matchmaking_queue WHERE player_id = $1', [botId]);
}

async function getMatchmakingStatus(botId) {
  const result = await query(
    `SELECT * FROM matchmaking_queue WHERE player_id = $1`,
    [botId]
  );
  return result.rows[0] || null;
}

async function findActiveGame(botId) {
  const result = await query(
    `SELECT * FROM active_games 
     WHERE (white_player_id = $1 OR black_player_id = $1)
     AND status IN ('playing', 'waiting')
     ORDER BY created_at DESC LIMIT 1`,
    [botId]
  );
  return result.rows[0] || null;
}

async function makeBotMove(bot, game) {
  const isWhite = game.white_player_id === bot.id;
  const fen = game.fen;
  const chess = new Chess(fen);

  // Check if it's our turn
  if ((isWhite && chess.turn() !== 'w') || (!isWhite && chess.turn() !== 'b')) {
    return null; // Not our turn
  }

  // Get legal moves
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  // Use Stockfish for the move
  let move = null;
  try {
    const depth = Math.max(5, Math.min(18, Math.floor(bot.elo / 150)));
    const nodes = Math.max(10000, Math.min(500000, bot.elo * 200));
    const engineMove = await getEngineMove(fen, depth, nodes);
    move = engineMove;
  } catch (e) {
    console.error('[BotRunner] Engine error, using random move:', e.message);
    move = moves[Math.floor(Math.random() * moves.length)].san;
  }

  // Apply move to verify
  try {
    chess.move(move);
  } catch (e) {
    // Invalid move, pick random legal
    move = moves[Math.floor(Math.random() * moves.length)].san;
    chess.move(move);
  }

  // Update game in database
  const newFen = chess.fen();
  const moveHistory = [...game.move_history, move];
  const moveCount = game.move_count + 1;

  let status = 'playing';
  let result = null;
  let endReason = null;

  if (chess.isCheckmate()) {
    status = 'finished';
    result = isWhite ? 'white' : 'black';
    endReason = 'checkmate';
  } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    status = 'finished';
    result = 'draw';
    endReason = chess.isStalemate() ? 'stalemate' : 'draw';
  }

  await query(
    `UPDATE active_games
     SET fen = $2, move_history = $3, move_count = $4, status = $5, result = $6, end_reason = $7, updated_at = CURRENT_TIMESTAMP
     WHERE game_id = $1`,
    [game.game_id, newFen, moveHistory, moveCount, status, result, endReason]
  );

  // Also update the games table for history
  await query(
    `UPDATE games
     SET fen = $2, move_history = $3, move_count = $4, status = $5, result = $6, end_reason = $7, updated_at = CURRENT_TIMESTAMP
     WHERE game_code = $1`,
    [game.game_id, newFen, moveHistory, moveCount, status, result, endReason]
  );

  if (status === 'finished') {
    await updateGameStats(bot.id, game, result, isWhite);
  }

  return { move, fen: newFen, status, result, endReason };
}

async function updateGameStats(botId, game, result, isWhite) {
  const won = result === (isWhite ? 'white' : 'black');
  const drawn = result === 'draw';

  await query(
    `UPDATE users SET
      games_played = games_played + 1,
      wins = wins + $2,
      losses = losses + $3,
      draws = draws + $4,
      elo = elo + $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`,
    [
      botId,
      won ? 1 : 0,
      (!won && !drawn) ? 1 : 0,
      drawn ? 1 : 0,
      won ? 10 : drawn ? 0 : -10
    ]
  );
}

async function sendChatMessage(botId, botName, gameId, message) {
  await query(
    `INSERT INTO chat_messages (user_id, username, room, body)
     VALUES ($1, $2, $3, $4)`,
    [botId, botName, `game:${gameId}`, message]
  );
}

async function maybeCreateCommunity(bot) {
  if (!bot.community_creator || Math.random() > 0.05) return; // 5% chance per game

  const idea = await generateCommunityIdea(bot);
  const parts = idea.split('|').map(s => s.trim());
  if (parts.length < 2) return;

  const [name, description, focus] = parts;
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

  try {
    const result = await query(
      `INSERT INTO clubs (slug, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [slug, name.slice(0, 80), description.slice(0, 500), bot.id]
    );

    if (result.rowCount > 0) {
      await query(
        `INSERT INTO club_members (club_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT DO NOTHING`,
        [result.rows[0].id, bot.id]
      );
      console.log(`[BotRunner] ${bot.name} created community: ${name}`);
    }
  } catch (e) {
    // Ignore duplicate slug errors
  }
}

async function recordActivity(botId, activityType, gameId, metadata = {}) {
  await query(
    `INSERT INTO bot_activity (bot_id, activity_type, game_id, metadata)
     VALUES ($1, $2, $3, $4)`,
    [botId, activityType, gameId, JSON.stringify(metadata)]
  );
}

export async function runBotLoop(bot) {
  console.log(`[BotRunner] Starting bot: ${bot.name} (${bot.id})`);

  const botUserId = await createBotUser(bot);
  let consecutiveErrors = 0;

  while (bot.is_active) {
    try {
      // Refresh bot config from DB
      const refreshed = await query('SELECT * FROM bots WHERE id = $1', [bot.id]);
      if (refreshed.rowCount === 0 || !refreshed.rows[0].is_active) {
        console.log(`[BotRunner] Bot ${bot.name} deactivated or deleted, stopping.`);
        break;
      }
      bot = { ...bot, ...refreshed.rows[0] };

      // Check if already in a game
      let game = await findActiveGame(bot.id);

      if (!game) {
        // Not in a game - join matchmaking
        const status = await getMatchmakingStatus(bot.id);
        if (!status) {
          await joinMatchmaking(bot.id, bot.name, bot.elo);
          await recordActivity(bot.id, 'matchmaking_join', null);
        }

        // Wait for match
        await delay(randomBetween(5000, 15000));
        game = await findActiveGame(bot.id);

        if (game) {
          console.log(`[BotRunner] ${bot.name} matched in game ${game.game_id}`);
          await recordActivity(bot.id, 'game_start', game.game_id, { color: game.white_player_id === bot.id ? 'white' : 'black' });
        }
        continue;
      }

      // We're in a game - make a move if it's our turn
      const moveResult = await makeBotMove(bot, game);
      if (moveResult) {
        await recordActivity(bot.id, 'move', game.game_id, { move: moveResult.move, fen: moveResult.fen });

        // Maybe chat after move
        if (Math.random() < bot.chat_frequency) {
          const gameState = {
            fen: moveResult.fen,
            color: game.white_player_id === bot.id ? 'white' : 'black',
            moveNumber: game.move_count,
            myTime: game.white_player_id === bot.id ? game.white_time_ms : game.black_time_ms,
            oppTime: game.white_player_id === bot.id ? game.black_time_ms : game.white_time_ms,
            lastMove: moveResult.move,
            result: moveResult.result,
          };
          const chatMsg = await generateChatMessage(bot, gameState, 'after_move');
          if (chatMsg) {
            await sendChatMessage(bot.id, bot.name, game.game_id, chatMsg);
            await recordActivity(bot.id, 'chat', game.game_id, { message: chatMsg });
          }
        }

        if (moveResult.status === 'finished') {
          console.log(`[BotRunner] ${bot.name} game ${game.game_id} finished: ${moveResult.result} (${moveResult.endReason})`);
          await recordActivity(bot.id, 'game_end', game.game_id, { result: moveResult.result, reason: moveResult.endReason });
          
          // Maybe create community
          await maybeCreateCommunity(bot);
          
          // Wait a bit before next game
          await delay(randomBetween(10000, 30000));
        }
      } else {
        // Not our turn - wait and check for chat opportunities
        if (Math.random() < bot.chat_frequency * 0.3) {
          const gameState = {
            fen: game.fen,
            color: game.white_player_id === bot.id ? 'white' : 'black',
            moveNumber: game.move_count,
            myTime: game.white_player_id === bot.id ? game.white_time_ms : game.black_time_ms,
            oppTime: game.white_player_id === bot.id ? game.black_time_ms : game.white_time_ms,
            lastMove: game.move_history[game.move_history.length - 1] || 'none',
            result: null,
          };
          const chatMsg = await generateChatMessage(bot, gameState, 'waiting');
          if (chatMsg) {
            await sendChatMessage(bot.id, bot.name, game.game_id, chatMsg);
            await recordActivity(bot.id, 'chat', game.game_id, { message: chatMsg });
          }
        }
        await delay(randomBetween(3000, 8000));
      }

      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors++;
      console.error(`[BotRunner] Error in ${bot.name} loop (${consecutiveErrors}):`, error.message);
      if (consecutiveErrors > 10) {
        console.error(`[BotRunner] Too many errors, stopping bot ${bot.name}`);
        break;
      }
      await delay(randomBetween(5000, 15000) * consecutiveErrors);
    }
  }

  // Cleanup
  await leaveMatchmaking(bot.id);
  console.log(`[BotRunner] Bot ${bot.name} stopped.`);
}

export async function startAllBots() {
  const result = await query('SELECT * FROM bots WHERE is_active = TRUE');
  console.log(`[BotRunner] Starting ${result.rowCount} active bots`);
  
  for (const bot of result.rows) {
    // Run each bot in background (non-blocking)
    runBotLoop(bot).catch(e => console.error(`[BotRunner] Bot ${bot.name} crashed:`, e));
    // Stagger starts
    await delay(randomBetween(1000, 5000));
  }
}

export async function stopBot(botId) {
  await query('UPDATE bots SET is_active = FALSE WHERE id = $1', [botId]);
  await leaveMatchmaking(botId);
}

export default { runBotLoop, startAllBots, stopBot };