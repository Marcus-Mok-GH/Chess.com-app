import { Router } from 'express';
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { computeScriptedMove } from '../../../../chess/src/engine/bots/scriptedMoves.js';
import { selectBrilliantMove } from '../../../../chess/src/engine/bots/brilliantMove.js';

// Resolve paths at module load time so they survive esbuild bundling.
const _require = createRequire(import.meta.url);
const _dirname = path.dirname(fileURLToPath(import.meta.url));

// Worker script is copied to the same directory as the bundle entry (dist/)
// by build.mjs. The source `_dirname` (this file's location) is used when the
// module is loaded directly under Node (dev / local tests); the bundle entry
// path is the production runtime. To handle both, look in the same directory
// first, then fall back to the parent directory (one level up from routes/).
/**
 * Preferred location for the bundled Stockfish worker script (sits next to
 * the route module when the package is consumed as source).
 * @type {string}
 */
const WORKER_SCRIPT_CANDIDATES = [
  path.resolve(_dirname, 'stockfish-worker.cjs'),
  path.resolve(_dirname, '..', 'stockfish-worker.cjs'),
  path.resolve(process.cwd(), 'artifacts/api-server/src/chess-server/stockfish-worker.cjs'),
  path.resolve(process.cwd(), 'artifacts/api-server/dist/stockfish-worker.cjs'),
  path.resolve(process.cwd(), 'dist/stockfish-worker.cjs'),
];
/**
 * Resolve the worker from both source and serverless bundle layouts. Vercel
 * runs the catch-all API from a traced function directory, not the source
 * directory, so cwd-based candidates are required in production.
 * @type {string|null}
 */
const WORKER_SCRIPT = WORKER_SCRIPT_CANDIDATES.find((candidate) => existsSync(candidate)) || null;

// Stockfish binary path (single-threaded WASM, no SharedArrayBuffer needed)
let STOCKFISH_BIN;
try {
  let pkgDir;
  try {
    pkgDir = path.dirname(_require.resolve('stockfish/package.json'));
  } catch (e) {
    // Fallback for Vercel/Serverless environments where package.json might not be bundled
    pkgDir = path.resolve(process.cwd(), 'node_modules', 'stockfish');
    if (!existsSync(pkgDir)) {
      pkgDir = path.resolve(_dirname, '..', '..', '..', 'node_modules', 'stockfish');
    }
  }
  
  const candidates = [
    path.join(pkgDir, 'bin', 'stockfish-18-lite-single.js'),
    path.join(pkgDir, 'bin', 'stockfish-18-single.js'),
    path.join(pkgDir, 'bin', 'stockfish-18.js'),
    path.join(process.cwd(), 'node_modules', 'stockfish', 'bin', 'stockfish-18-lite-single.js')
  ];
  
  STOCKFISH_BIN = candidates.find(c => existsSync(c));
  
  if (!STOCKFISH_BIN) {
     console.warn('[Engine] Stockfish binary not found in candidates. Tried:', candidates);
  }
} catch (e) {
  console.error('[Engine] Could not resolve stockfish binary:', e.message);
}

const MAX_IN_FLIGHT = Math.max(1, Number.parseInt(process.env.ENGINE_MAX_IN_FLIGHT || '4', 10));
let activeRequests = 0;

function engineConcurrency(req, res, next) {
  if (activeRequests >= MAX_IN_FLIGHT) {
    return res.status(429).json({ error: { message: 'Engine is busy. Please try again shortly.' } });
  }
  activeRequests += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

const TIMEOUT_MS = (() => {
  const env = parseInt(process.env.FUNCTION_TIMEOUT_MS, 10);
  if (!isNaN(env) && env > 0) return Math.max(env - 1500, 1000);
  return 10000;
})();

const MAX_STRENGTH_MOVETIME_MS = Math.min(1800, Math.max(300, TIMEOUT_MS - 3500));

// Root moves scored for a brilliancy hunt: enough to find the good sacrifices
// without diluting the search depth on each line.
const BRILLIANT_MULTIPV = 5;

const router = Router();

function isValidFen(fen) {
  if (!fen || typeof fen !== 'string') return false;
  try { new Chess(fen); return true; } catch { return false; }
}

export function getSearchParams(bot) {
  if (!bot) return 'go movetime 900';
  if (bot.maxStrength) return `go movetime ${MAX_STRENGTH_MOVETIME_MS}`;
  const nodes = Math.min(Math.max(Number(bot.nodes) || 10000, 1), 1_000_000);
  if (nodes < 5000) return `go nodes ${nodes}`;
  return `go movetime ${Math.min(Math.max(Math.floor(nodes / 100), 150), 1200)}`;
}
function getFallbackMove(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  // Prefer a forcing move when one is available, then fall back to the first
  // legal move. This keeps guest games playable when a serverless deployment
  // cannot load Stockfish assets; Stockfish remains the normal path when its
  // worker is available.
  const move = moves.find((candidate) => candidate.captured || candidate.san?.includes('+')) || moves[0];
  return move.from + move.to + (move.promotion || '');
}

function shouldUseFallback(error) {
  if (!STOCKFISH_BIN || !WORKER_SCRIPT) return true;
  const message = String(error?.message || '').toLowerCase();
  return /stockfish|worker|wasm|enoent|spawn/.test(message);
}

function runEngine(fen, searchParams, bot, timeoutMs, { multiPv = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!STOCKFISH_BIN || !WORKER_SCRIPT) {
      return reject(new Error(`Stockfish binary or worker script not found. BIN: ${STOCKFISH_BIN}, WORKER: ${WORKER_SCRIPT}`));
    }

    const child = spawn(process.execPath, [WORKER_SCRIPT, STOCKFISH_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const candidates = [];
    let outputBuf = '';
    let settled = false;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`Search timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      outputBuf += data.toString();
      let nl;
      while ((nl = outputBuf.indexOf('\n')) !== -1) {
        const line = outputBuf.slice(0, nl).trim();
        outputBuf = outputBuf.slice(nl + 1);
        if (!line) continue;

        if (line.includes(' pv ')) {
          const pvMatch  = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
          const depthMatch = line.match(/depth (\d+)/);
          const scoreMatch = line.match(/score cp (-?\d+)/);
          const mateMatch  = line.match(/score mate (-?\d+)/);
          if (pvMatch) {
            const move  = pvMatch[1];
            const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
            let score = 0;
            if (scoreMatch) score = parseInt(scoreMatch[1], 10);
            else if (mateMatch) score = parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000;
            const existing = candidates.find(m => m.move === move);
            if (existing) { if (depth >= existing.depth) { existing.score = score; existing.depth = depth; } }
            else candidates.push({ move, score, depth });
          }
        }

        if (line.startsWith('bestmove')) {
          const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
          if (match) {
            settle(() => resolve({ bestMove: match[1], candidates }));
          } else {
            settle(() => reject(new Error('bestmove line had no move: ' + line)));
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      console.error('[Stockfish Worker]', data.toString().trim());
    });

    child.on('error', (err) => settle(() => reject(err)));
    child.on('close', (code) => {
      settle(() => reject(new Error(`Worker exited with code ${code} before bestmove`)));
    });

    // Send UCI commands over stdin (keep stdin open — the worker exits
    // itself when stdin closes, which would kill the search mid-flight)
    const commands = [
      'setoption name Hash value 8',
      'setoption name Threads value 1',
    ];
    if (bot?.playStyle) {
      const safeDepth = Math.min(Math.max(Number(bot.depth) || 1, 1), 20);
      commands.push(`setoption name Skill Level value ${Math.min(20, Math.floor(safeDepth * 3.33))}`);
    }
    // Brilliancy hunting needs the scores of the runner-up moves, not just the
    // best one, so the search reports the top few root moves.
    if (multiPv > 1) commands.push(`setoption name MultiPV value ${Math.min(Math.trunc(multiPv), 5)}`);
    commands.push('uci', 'ucinewgame', `position fen ${fen}`, searchParams);
    for (const cmd of commands) child.stdin.write(cmd + '\n');
  });
}

export async function computeManagedBotMove(fen, elo = 1200) {
  const depth = Math.max(2, Math.min(10, Math.floor(Number(elo) / 200) || 6));
  try {
    const result = await runEngine(fen, 'go movetime 450', { depth, playStyle: 'balanced' }, 2500);
    return result.bestMove;
  } catch (error) {
    console.warn('[Engine] Managed bot using legal fallback:', error?.message);
    return getFallbackMove(fen);
  }
}

// Local bot games are intentionally available to guests. The concurrency
// guard still protects the serverless engine from unbounded parallel work.
router.post('/move', engineConcurrency, async (req, res) => {
  try {
    const { fen, bot, debug } = req.body;
    if (!fen) return errorResponse(res, 400, 'Missing required field: fen');
    if (!isValidFen(fen)) return errorResponse(res, 400, 'Invalid FEN string');

    // Scripted personalities (e.g. the Bongcloud + donation preamble) answer
    // before the engine whenever the position matches their script.
    const scriptedMove = computeScriptedMove(fen, bot?.scriptedOpening);
    if (scriptedMove) {
      if (debug) console.log('[Engine] FEN:', fen, '| Scripted move:', scriptedMove);
      return res.json({
        type: 'result',
        bestMove: scriptedMove,
        scripted: true,
        debugInfo: debug ? { fen, scriptedMove, botName: bot?.name, scripted: true } : null,
      });
    }

    const searchParams = getSearchParams(bot);
    const multiPv = bot?.brilliant ? BRILLIANT_MULTIPV : 0;
    if (debug) console.log('[Engine] FEN:', fen, '| Search:', searchParams);

    const result = await runEngine(fen, searchParams, bot, TIMEOUT_MS, { multiPv });

    // Mr. Brilliant plays the flashiest sacrifice the evaluation can afford
    // (multiPv > 0); every other bot keeps the engine's top move.
    const pick = multiPv > 0 ? selectBrilliantMove(fen, result.candidates) : null;
    const bestMove = pick?.move || result.bestMove;

    return res.json({
      type: 'result',
      ...result,
      bestMove,
      brilliant: Boolean(pick?.brilliant),
      debugInfo: debug
        ? { fen, searchParams, botName: bot?.name, multiPv, brilliant: pick ?? null }
        : null,
    });
  } catch (error) {
    if (shouldUseFallback(error)) {
      const bestMove = getFallbackMove(fen);
      if (bestMove) {
        console.warn('[Engine] Stockfish unavailable; returning a legal fallback move:', error.message);
        return res.json({
          type: 'result',
          bestMove,
          engineFallback: true,
          debugInfo: debug ? { fen, searchParams, botName: bot?.name, engineFallback: true } : null,
        });
      }
    }

    console.error('[Engine] Move error:', error.message);
    return handleRouteError(res, error, 'Failed to calculate move');
  }
});

// ── Batch position evaluation (game review) ─────────────────────────────────

const REVIEW_MAX_POSITIONS = 16;
const REVIEW_MIN_MOVETIME_MS = 50;
const REVIEW_MAX_MOVETIME_MS = 600;
const REVIEW_DEFAULT_MOVETIME_MS = 200;

/**
 * Convert a UCI move (e.g. "e2e4", "e7e8q") into SAN for the given position.
 * Returns null when the move is not legal in the position.
 */
export function uciMoveToSan(fen, uci) {
  if (typeof uci !== 'string' || uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    const applied = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return applied?.san || null;
  } catch {
    return null;
  }
}

/**
 * Evaluate a batch of positions for the game-review page. Each FEN is scored
 * from the perspective of the side to move. Positions where the game is already
 * over are returned with `gameOver: true` and no score, so the client can show
 * the final result without feeding them to the engine.
 */
router.post('/evaluate-positions', engineConcurrency, async (req, res) => {
  try {
    const { fens } = req.body || {};
    if (!Array.isArray(fens) || fens.length === 0) {
      return errorResponse(res, 400, 'Missing required field: fens (non-empty array)');
    }
    if (fens.length > REVIEW_MAX_POSITIONS) {
      return errorResponse(res, 400, `Too many positions: send at most ${REVIEW_MAX_POSITIONS} per request`);
    }
    for (const fen of fens) {
      if (typeof fen !== 'string' || !isValidFen(fen)) {
        return errorResponse(res, 400, 'Invalid FEN string in fens');
      }
    }
    const movetimeMs = Math.min(
      REVIEW_MAX_MOVETIME_MS,
      Math.max(REVIEW_MIN_MOVETIME_MS, Number.parseInt(req.body.movetimeMs, 10) || REVIEW_DEFAULT_MOVETIME_MS)
    );

    if (!STOCKFISH_BIN || !WORKER_SCRIPT) {
      return errorResponse(res, 503, 'Stockfish engine is not available in this deployment');
    }

    const results = [];
    // Stay under the serverless function timeout: cap each engine run by the
    // remaining batch budget and report skipped positions instead of hanging.
    const deadline = Date.now() + TIMEOUT_MS;
    for (const fen of fens) {
      let chess;
      try { chess = new Chess(fen); } catch {
        results.push({ fen, gameOver: true, scoreCp: null, mate: null, bestMove: null, bestSan: null, depth: null });
        continue;
      }
      if (chess.isGameOver()) {
        // Finished positions have a known value: the side to move is either
        // checkmated (-100000) or the game ended in a draw (0).
        const scoreCp = chess.isCheckmate() ? -100000 : 0;
        results.push({ fen, gameOver: true, scoreCp, mate: chess.isCheckmate() ? 0 : null, bestMove: null, bestSan: null, depth: null });
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining < movetimeMs + 500) {
        results.push({ fen, gameOver: false, scoreCp: null, mate: null, bestMove: null, bestSan: null, depth: null, error: 'Time budget exhausted' });
        continue;
      }
      try {
        const engine = await runEngine(fen, `go movetime ${movetimeMs}`, null, Math.min(remaining, Math.max(4000, movetimeMs * 12)));
        // candidates[0] can hold a stale first-seen PV; prefer the candidate
        // matching the engine's final best move, falling back to the deepest.
        const best =
          engine.candidates.find((c) => c.move === engine.bestMove) ||
          engine.candidates.reduce((a, c) => (!a || c.depth > a.depth ? c : a), null);
        results.push({
          fen,
          gameOver: false,
          scoreCp: best ? best.score : null,
          // The worker folds mate scores into ±100000 centipawns, so mate
          // distance is not available here; the client renders those as "M".
          mate: null,
          bestMove: engine.bestMove || best?.move || null,
          bestSan: uciMoveToSan(fen, engine.bestMove || best?.move || ''),
          depth: best ? best.depth : null,
        });
      } catch (error) {
        console.error('[Engine] Position eval failed:', fen, error.message);
        results.push({ fen, gameOver: false, scoreCp: null, mate: null, bestMove: null, bestSan: null, depth: null, error: 'Engine search failed' });
      }
    }

    return res.json({ results, movetimeMs });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to evaluate positions');
  }
});

export default router;
