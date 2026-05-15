import { Chess } from 'chess.js';

const STOCKFISH_PATHS = [
  '/stockfish.wasm.js',
  '/stockfish.js',
  './stockfish.wasm.js',
  './stockfish.js',
];

const INIT_TIMEOUT_MS = 15000;
const SEARCH_TIMEOUT_MS = 25000; // Send 'stop' after this
const SEARCH_ABORT_MS = 3000;    // Hard-reject this long after 'stop'

// ─── Engine singleton ─────────────────────────────────────────────
let engine = null;
let engineReady = false;
let initPromise = null; // Guards against concurrent init calls

// ─── Search state ────────────────────────────────────────────────────
let pendingCallback = null;
let pendingReject = null;
let collectedMoves = [];
let isSearching = false;
let searchTimeoutId = null;
let searchAbortId = null;

// ─── Helpers ─────────────────────────────────────────────────────────────

function resetEngineState() {
  engineReady = false;
  initPromise = null;
  if (engine) {
    try { engine.terminate(); } catch { /* ignore */ }
    engine = null;
  }
}

/**
 * Reject any pending search promise and clear all search-related timers.
 * Safe to call even when no search is active.
 */
function cleanupSearch(error) {
  if (searchTimeoutId) { clearTimeout(searchTimeoutId); searchTimeoutId = null; }
  if (searchAbortId)   { clearTimeout(searchAbortId);   searchAbortId   = null; }
  collectedMoves = [];

  if (error && pendingReject) {
    const reject = pendingReject;
    pendingReject = null;
    pendingCallback = null;
    reject(error);
  } else {
    pendingReject = null;
    pendingCallback = null;
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────

function initEngine() {
  // Already up and running
  if (engine && engineReady) return Promise.resolve(engine);

  // Init already in flight — return the same promise to all callers
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      initPromise = null; // Allow future retries on failure
      resolve(value);
    };

    const initTimeout = setTimeout(() => {
      console.error('[Stockfish] Initialization timed out.');
      cleanupSearch(new Error('Stockfish init timed out'));
      resetEngineState();
      resolveOnce(null);
    }, INIT_TIMEOUT_MS);

    // Try each known Stockfish path in order
    let success = false;
    for (const path of STOCKFISH_PATHS) {
      try {
        engine = new Worker(path);
        success = true;
        break;
      } catch {
        // Try next path
      }
    }

    if (!success) {
      clearTimeout(initTimeout);
      console.error('[Stockfish] All paths failed to load.');
      engine = null;
      resolveOnce(null);
      return;
    }

    engine.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);

      // ── UCI handshake step 1: engine identifies itself ──
      if (line === 'uciok') {
        engine.postMessage('isready');
        return;
      }

      // ── UCI handshake step 2: engine is fully ready ──
      if (line === 'readyok') {
        if (!engineReady) {
          engineReady = true;
          clearTimeout(initTimeout);
          resolveOnce(engine);
        }
        return;
      }

      // ── Analysis lines ──
      if (line.includes(' pv ')) {
        const depthMatch  = line.match(/depth (\d+)/);
        const scoreMatch  = line.match(/score cp (-?\d+)/);
        const mateMatch   = line.match(/score mate (-?\d+)/);
        const pvMatch     = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);

        if (pvMatch) {
          const move  = pvMatch[1];
          const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          let   score = 0;

          if (scoreMatch)     score = parseInt(scoreMatch[1], 10);
          else if (mateMatch) score = parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000;

          const existing = collectedMoves.find(m => m.move === move);
          if (existing) {
            if (depth >= existing.depth) { existing.score = score; existing.depth = depth; }
          } else {
            collectedMoves.push({ move, score, depth });
          }
        }
      }

      // ── Search complete ──
      if (line.startsWith('bestmove')) {
        const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
        if (match && pendingCallback) {
          // Clear timeout guards
          if (searchTimeoutId) { clearTimeout(searchTimeoutId); searchTimeoutId = null; }
          if (searchAbortId)   { clearTimeout(searchAbortId);   searchAbortId   = null; }

          const bestMove = match[1];
          if (!collectedMoves.find(m => m.move === bestMove)) {
            collectedMoves.unshift({ move: bestMove, score: 0, depth: 0 });
          }

          const cb = pendingCallback;
          pendingCallback = null;
          pendingReject   = null;
          cb(bestMove, collectedMoves);
        }
      }
    };

    engine.onerror = (err) => {
      console.error('[Stockfish] Engine error:', err);
      clearTimeout(initTimeout);
      // Unblock any hanging search promise
      cleanupSearch(new Error('Stockfish engine crashed'));
      resetEngineState();
      resolveOnce(null); // No-op if init already succeeded
    };

    // Kick off the UCI handshake
    engine.postMessage('uci');
  });

  return initPromise;
}

// ─── Search helpers ───────────────────────────────────────────────────

function getSearchParams(bot) {
  const nodes = bot.nodes || 10000;
  const depth = bot.depth || 10;

  if (nodes < 5000)       return `go nodes ${nodes}`;
  if (nodes < 50000)      return `go movetime ${Math.min(nodes / 10, 1000)}`;
  return                         `go depth ${Math.min(depth + 2, 15)}`;
}

function selectMove(bestMove, candidates, bot, game) {
  if (!candidates || candidates.length === 0) return bestMove;

  candidates.sort((a, b) => b.score - a.score);
  const rand = Math.random();

  if (bot.blunderChance && rand < bot.blunderChance && candidates.length > 2) {
    const badMoves = candidates.slice(Math.floor(candidates.length * 0.6));
    if (badMoves.length > 0) return badMoves[Math.floor(Math.random() * badMoves.length)].move;
  }

  if (
    bot.missedTacticsChance &&
    rand < bot.blunderChance + bot.missedTacticsChance &&
    candidates.length > 1
  ) {
    const okMoves = candidates.slice(0, Math.min(5, candidates.length));
    if (okMoves.length > 0) return okMoves[Math.floor(Math.random() * okMoves.length)].move;
  }

  if (bot.playStyle && candidates.length > 1) {
    const scored = candidates.map(c => {
      let bonus = 0;
      try {
        const tempGame = new Chess(game.fen());
        const moveObj  = tempGame.move(c.move);
        if (moveObj) {
          if (bot.playStyle.aggression) {
            if (moveObj.captured)     bonus += bot.playStyle.aggression * 20;
            if (tempGame.inCheck())   bonus += bot.playStyle.aggression * 15;
          }
          if (bot.playStyle.queenActivity && moveObj.piece === 'q') {
            bonus += bot.playStyle.queenActivity * 25;
          }
          if (bot.playStyle.favorsCenter) {
            if (['d4','d5','e4','e5'].includes(moveObj.to)) {
              bonus += bot.playStyle.favorsCenter * 15;
            }
          }
        }
      } catch { /* ignore invalid moves */ }
      return { ...c, adjustedScore: c.score + bonus };
    });

    scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

    if (Math.random() < 0.3 && scored.length > 1) {
      const top = scored.slice(0, Math.min(3, scored.length));
      return top[Math.floor(Math.random() * top.length)].move;
    }
    return scored[0].move;
  }

  return bestMove;
}

// ─── Core search ───────────────────────────────────────────────────────────

async function findBestMove(fen, bot, debug) {
  const startTime = performance.now();
  const game = new Chess(fen);

  await initEngine();

  if (!engine || !engineReady) {
    throw new Error('Stockfish engine failed to initialize.');
  }

  collectedMoves = [];

  return new Promise((resolve, reject) => {
    pendingReject = reject;

    pendingCallback = (bestMove, candidates) => {
      const time = Math.round(performance.now() - startTime);
      const selectedMove = selectMove(bestMove, candidates, bot, game);
      resolve({
        type: 'result',
        bestMove: selectedMove,
        debugInfo: debug ? {
          time,
          candidates: candidates.length,
          engineBest: bestMove,
          selected: selectedMove,
          bot: bot.name,
        } : null,
      });
    };

    // ── Graceful timeout: ask engine to stop, then wait for bestmove ──
    searchTimeoutId = setTimeout(() => {
      searchTimeoutId = null;
      console.warn('[Stockfish] Search timeout — sending stop.');
      try { if (engine) engine.postMessage('stop'); } catch { /* ignore */ }

      // Hard abort if bestmove still doesn't arrive
      searchAbortId = setTimeout(() => {
        searchAbortId = null;
        if (pendingCallback) {
          cleanupSearch(new Error(`Search timed out after ${SEARCH_TIMEOUT_MS + SEARCH_ABORT_MS}ms`));
        }
      }, SEARCH_ABORT_MS);
    }, SEARCH_TIMEOUT_MS);

    // ── Correct UCI command order ──
    // setoption must come before ucinewgame, position comes last before go
    const multiPV = Math.min(5, game.moves().length);
    engine.postMessage(`setoption name MultiPV value ${multiPV}`);
    engine.postMessage('ucinewgame');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(getSearchParams(bot));
  });
}

// ─── Web Worker message handler ───────────────────────────────────────────────

self.onmessage = async function (e) {
  const { fen, bot, debug } = e.data;

  if (isSearching) {
    console.warn('[Stockfish] Already searching — dropping request.');
    self.postMessage({ type: 'busy', error: 'Engine busy — request dropped, please retry' });
    return;
  }

  isSearching = true;

  try {
    const result = await findBestMove(fen, bot, debug);
    self.postMessage(result);
  } catch (err) {
    console.error('[Stockfish] Worker error:', err);
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : 'Unknown Stockfish worker error',
      debugInfo: debug ? { error: err instanceof Error ? err.message : String(err) } : null,
    });
  } finally {
    isSearching = false;
  }
};

// ─── Warm up immediately on worker load ──────────────────────────────────────────────
// Starts Stockfish initialisation in the background so the engine is ready
// by the time the first move request arrives.
initEngine().then((e) => {
  if (e) {
    console.info('[Stockfish] Engine warmed up and ready.');
  } else {
    console.warn('[Stockfish] Warm-up failed — will retry on first move request.');
  }
});
