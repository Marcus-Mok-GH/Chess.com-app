const memoryStore = {
  playerId: null,
  playerName: null,
  queue: [],
};
const CHANNEL_NAME = 'chess_matchmaking_sync';

// Session-specific player ID for matchmaking (so multiple tabs can have different IDs)
// Generate it immediately with a timestamp to ensure uniqueness
let sessionPlayerId = `${crypto.randomUUID()}_${Date.now()}`;
console.log('[Matchmaking] Module loaded with session ID:', sessionPlayerId);

const DEFAULT_ELO = 1200;
const K_FACTOR = 32;
const ELO_RANGE_INITIAL = 200;
const ELO_RANGE_RELAXATION_TIME = 10000;

let broadcastChannel = null;
let queueListeners = new Set();

function getBroadcastChannel() {
  if (!broadcastChannel && typeof BroadcastChannel !== 'undefined') {
    console.log('[Matchmaking] Creating BroadcastChannel:', CHANNEL_NAME);
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      console.log('[Matchmaking] BroadcastChannel received:', event.data);
      const { type, data } = event.data;
      queueListeners.forEach((callback) => callback(type, data));
    };
  }
  return broadcastChannel;
}

function broadcast(type, data) {
  const channel = getBroadcastChannel();
  if (channel) {
    console.log('[Matchmaking] Broadcasting:', type, data);
    channel.postMessage({ type, data });
  } else {
    console.warn('[Matchmaking] BroadcastChannel not available');
  }
}

// Note: ELO is now managed by UserContext and stored in database
// These functions are kept for backward compatibility but should use user prop when available

export function getPlayerElo(user = null) {
  // If user object is provided, use it
  if (user && user.elo) {
    return user.elo;
  }
  // Fallback to default
  return DEFAULT_ELO;
}

export function setPlayerElo(elo) {
  // ELO is now managed server-side via POST /api/games/save → computeAndApplyElo().
  // This function is kept for backward compatibility but does nothing.
  console.warn('[Matchmaking] setPlayerElo is deprecated - ELO is now computed server-side on game save.');
}

export function getUserStats(user = null) {
  // If user object is provided, use it
  if (user) {
    return {
      username: user.username,
      elo: user.elo || DEFAULT_ELO,
      gamesPlayed: user.gamesPlayed || 0,
      wins: user.wins || 0,
      losses: user.losses || 0,
      draws: user.draws || 0,
    };
  }
  return null;
}

export function calculateNewElo(playerElo, opponentElo, result) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const newElo = playerElo + K_FACTOR * (result - expectedScore);
  return Math.round(newElo);
}

export function updateEloAfterGame(opponentElo, result) {
  const currentElo = getPlayerElo();
  const newElo = calculateNewElo(currentElo, opponentElo, result);
  setPlayerElo(newElo);
  return newElo;
}

export function getPlayerId() {
  // For matchmaking, use a session-specific ID so multiple tabs can queue independently
  // Session ID is generated when the module loads
  console.log('[Matchmaking] getPlayerId() returning:', sessionPlayerId);
  return sessionPlayerId;
}

export function getPersistentPlayerId() {
  if (!memoryStore.playerId) {
    memoryStore.playerId = crypto.randomUUID();
  }
  return memoryStore.playerId;
}

export function getPlayerName(user = null) {
  // If user object is provided, use it
  if (user && user.username) {
    return user.username;
  }
  // Generate a guest name for anonymous players
  if (!memoryStore.playerName) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    memoryStore.playerName = 'Guest_' + suffix;
  }
  return memoryStore.playerName;
}

export function isLoggedIn(user = null) {
  // Check if user object is provided and has required fields
  return !!(user && user.username && user.id);
}

export function setPlayerName(name) {
  memoryStore.playerName = name;
}

function getQueue() {
  return memoryStore.queue || [];
}

function saveQueue(queue) {
  memoryStore.queue = queue;
}

function cleanupStaleEntries(queue) {
  const now = Date.now();
  const maxAge = 60000;
  return queue.filter((entry) => now - entry.timestamp < maxAge);
}

export function joinMatchmakingQueue(isRanked = true) {
  const playerId = getPlayerId();
  const elo = getPlayerElo();
  const playerName = getPlayerName();
  const timestamp = Date.now();

  let queue = getQueue();
  console.log('[Matchmaking] Current queue before join:', queue.map(e => ({ id: e.playerId.substring(0, 8), elo: e.elo, name: e.playerName })));
  queue = cleanupStaleEntries(queue);

  const existingIndex = queue.findIndex((e) => e.playerId === playerId);
  if (existingIndex !== -1) {
    console.log('[Matchmaking] Updating existing queue entry');
    queue[existingIndex] = { playerId, playerName, elo, timestamp, isRanked };
  } else {
    console.log('[Matchmaking] Adding new player to queue');
    queue.push({ playerId, playerName, elo, timestamp, isRanked });
  }

  saveQueue(queue);
  console.log('[Matchmaking] Queue after join:', queue.map(e => ({ id: e.playerId.substring(0, 8), elo: e.elo, name: e.playerName })));
  broadcast('queue_updated', { playerId, playerName, action: 'joined' });

  console.log('[Matchmaking] Joined queue:', { playerId: playerId.substring(0, 8) + '...', playerName, elo, queueSize: queue.length });

  return { playerId, playerName, elo, timestamp, isRanked };
}

export function refreshQueueEntry() {
  const playerId = getPlayerId();
  let queue = getQueue();
  queue = cleanupStaleEntries(queue);
  
  const existingIndex = queue.findIndex((e) => e.playerId === playerId);
  if (existingIndex !== -1) {
    queue[existingIndex].timestamp = Date.now();
    saveQueue(queue);
    console.log('[Matchmaking] Refreshed queue entry for:', playerId.substring(0, 8));
    return true;
  }
  return false;
}

export function leaveMatchmakingQueue() {
  const playerId = getPlayerId();
  let queue = getQueue();
  queue = queue.filter((e) => e.playerId !== playerId);
  saveQueue(queue);
  broadcast('queue_updated', { playerId, action: 'left' });
}

export function findMatch() {
  const playerId = getPlayerId();
  const playerElo = getPlayerElo();
  const now = Date.now();

  let queue = getQueue();
  queue = cleanupStaleEntries(queue);
  saveQueue(queue);

  const playerEntry = queue.find((e) => e.playerId === playerId);
  if (!playerEntry) {
    return null;
  }

  const waitTime = now - playerEntry.timestamp;
  const relaxed = waitTime > ELO_RANGE_RELAXATION_TIME;
  const eloRange = relaxed ? Infinity : ELO_RANGE_INITIAL;

  const candidates = queue.filter((e) => {
    if (e.playerId === playerId) return false;
    if (e.isRanked !== playerEntry.isRanked) return false;
    return Math.abs(e.elo - playerElo) <= eloRange;
  });

  if (candidates.length === 0) {
    console.log('[Matchmaking] No opponents found. Queue size:', queue.length);
    return null;
  }

  candidates.sort((a, b) => Math.abs(a.elo - playerElo) - Math.abs(b.elo - playerElo));
  const opponent = candidates[0];

  queue = queue.filter((e) => e.playerId !== playerId && e.playerId !== opponent.playerId);
  saveQueue(queue);

  // Generate a deterministic match ID based on player IDs
  // The player with the lexicographically smaller ID creates the game
  const sortedIds = [playerId, opponent.playerId].sort();
  const matchId = `MATCH_${sortedIds[0]}_${sortedIds[1]}`;
  const isCreator = playerId === sortedIds[0];

  console.log('[Matchmaking] Match found!', { 
    playerId, 
    playerName: playerEntry.playerName,
    opponentId: opponent.playerId,
    opponentName: opponent.playerName,
    matchId,
    isCreator 
  });

  // Build player info map for the broadcast
  const playerInfo = {
    [playerId]: { name: playerEntry.playerName, elo: playerEntry.elo },
    [opponent.playerId]: { name: opponent.playerName, elo: opponent.elo }
  };

  broadcast('match_found', { 
    player1: sortedIds[0], 
    player2: sortedIds[1],
    matchId,
    creator: sortedIds[0],
    playerInfo
  });

  return {
    opponentId: opponent.playerId,
    opponentName: opponent.playerName,
    opponentElo: opponent.elo,
    isRanked: playerEntry.isRanked,
    matchedAt: now,
    matchId,
    isCreator,
  };
}

export function getQueueStatus() {
  const playerId = getPlayerId();
  let queue = getQueue();
  queue = cleanupStaleEntries(queue);

  const playerEntry = queue.find((e) => e.playerId === playerId);
  if (!playerEntry) {
    return { inQueue: false, position: -1, estimatedWait: 0 };
  }

  const position = queue.findIndex((e) => e.playerId === playerId) + 1;
  const waitTime = Date.now() - playerEntry.timestamp;
  const estimatedWait = Math.max(0, 30000 - waitTime);

  return { inQueue: true, position, estimatedWait };
}

export function subscribeToQueue(callback) {
  console.log('[Matchmaking] Adding queue listener');
  queueListeners.add(callback);
  getBroadcastChannel();

  return () => {
    console.log('[Matchmaking] Removing queue listener');
    queueListeners.delete(callback);
  };
}
