const CHANNEL_NAME = 'chess_online_sync';

const memoryStore = {
  games: {},
};

let broadcastChannel = null;
let listeners = new Map();

function getBroadcastChannel() {
  if (!broadcastChannel && typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const { gameId, type, data } = event.data;
      const gameListeners = listeners.get(gameId);
      if (gameListeners) {
        gameListeners.forEach((callback) => callback(type, data));
      }
    };
  }
  return broadcastChannel;
}

function broadcast(gameId, type, data) {
  const channel = getBroadcastChannel();
  if (channel) {
    channel.postMessage({ gameId, type, data });
  }
}

function getGames() {
  return memoryStore.games;
}

function saveGames(games) {
  memoryStore.games = games;
}

export function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createGame(creatorColor = 'white', gameMode = 'friendly', creatorElo = null, customGameId = null, creatorName = null) {
  const gameId = customGameId || generateGameId();
  const playerId = crypto.randomUUID();
  const now = Date.now();

  const game = {
    id: gameId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    creatorId: playerId,
    creatorColor,
    creatorName: creatorName || 'Player',
    opponentId: null,
    opponentName: null,
    lastMove: null,
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    moveHistory: [],
    chat: [],
    gameMode,
    creatorElo: gameMode === 'ranked' ? creatorElo : null,
    opponentElo: null,
  };

  const games = getGames();
  games[gameId] = game;
  saveGames(games);

  return { gameId, playerId, color: creatorColor, gameMode };
}

export function createRankedGame(creatorColor, creatorElo, customGameId = null, creatorName = null) {
  return createGame(creatorColor, 'ranked', creatorElo, customGameId, creatorName);
}

export function joinGame(gameId, opponentElo = null, opponentName = null) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  if (game.status !== 'waiting') {
    return { error: 'Game already started or ended' };
  }

  const playerId = crypto.randomUUID();
  const color = game.creatorColor === 'white' ? 'black' : 'white';

  game.opponentId = playerId;
  game.opponentName = opponentName || 'Opponent';
  game.opponentElo = game.gameMode === 'ranked' ? opponentElo : null;
  game.status = 'playing';
  game.updatedAt = Date.now();

  games[gameId] = game;
  saveGames(games);

  broadcast(gameId, 'player_joined', { playerId, color, opponentName: game.opponentName });

  return { gameId, playerId, color, gameMode: game.gameMode, creatorName: game.creatorName };
}

export function getGame(gameId) {
  const games = getGames();
  return games[gameId] || null;
}

export function updateGame(gameId, fen, lastMove, moveHistory) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  game.fen = fen;
  game.lastMove = lastMove;
  game.moveHistory = moveHistory || game.moveHistory;
  game.updatedAt = Date.now();

  games[gameId] = game;
  saveGames(games);

  broadcast(gameId, 'move', { fen, lastMove, moveHistory: game.moveHistory });

  return { success: true };
}

export function updateGameStatus(gameId, status) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  game.status = status;
  game.updatedAt = Date.now();

  games[gameId] = game;
  saveGames(games);

  broadcast(gameId, 'status_change', { status });

  return { success: true };
}

export function leaveGame(gameId, playerId) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  if (game.status === 'waiting') {
    delete games[gameId];
  } else {
    game.status = 'ended';
    game.updatedAt = Date.now();
    games[gameId] = game;
  }

  saveGames(games);
  broadcast(gameId, 'player_left', { playerId });

  return { success: true };
}

export function sendReaction(gameId, playerId, reaction) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  broadcast(gameId, 'reaction', { playerId, reaction, timestamp: Date.now() });

  return { success: true };
}

export function sendChatMessage(gameId, playerId, message) {
  const games = getGames();
  const game = games[gameId];

  if (!game) {
    return { error: 'Game not found' };
  }

  const chatMessage = {
    id: crypto.randomUUID(),
    playerId,
    message,
    timestamp: Date.now(),
  };

  game.chat = game.chat || [];
  game.chat.push(chatMessage);
  game.updatedAt = Date.now();

  games[gameId] = game;
  saveGames(games);

  broadcast(gameId, 'chat', chatMessage);

  return { success: true };
}

export function subscribeToGame(gameId, callback) {
  if (!listeners.has(gameId)) {
    listeners.set(gameId, new Set());
  }
  listeners.get(gameId).add(callback);

  getBroadcastChannel();

  return () => {
    const gameListeners = listeners.get(gameId);
    if (gameListeners) {
      gameListeners.delete(callback);
      if (gameListeners.size === 0) {
        listeners.delete(gameId);
      }
    }
  };
}

export function pollGameState(gameId, lastUpdatedAt, callback) {
  const checkForUpdates = () => {
    const game = getGame(gameId);
    if (game && game.updatedAt > lastUpdatedAt) {
      callback(game);
      return game.updatedAt;
    }
    return lastUpdatedAt;
  };

  let currentTimestamp = lastUpdatedAt;
  const intervalId = setInterval(() => {
    currentTimestamp = checkForUpdates();
  }, 500);

  return () => clearInterval(intervalId);
}

export function cleanupOldGames() {
  const games = getGames();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;

  let cleaned = false;
  for (const [gameId, game] of Object.entries(games)) {
    if (now - game.updatedAt > maxAge) {
      delete games[gameId];
      cleaned = true;
    }
  }

  if (cleaned) {
    saveGames(games);
  }
}

cleanupOldGames();
