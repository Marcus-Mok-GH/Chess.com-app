import { Router } from 'express';
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

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
const PRIMARY_WORKER_SCRIPT = path.resolve(_dirname, 'stockfish-worker.cjs');
/**
 * Fallback location used when the package is consumed from the esbuild
 * bundle output (`dist/`), where the worker is hoisted one level up.
 * @type {string}
 */
const FALLBACK_WORKER_SCRIPT = path.resolve(_dirname, '..', 'stockfish-worker.cjs');
/**
 * Resolved worker script path. Stays `null` when neither candidate exists on
 * disk so {@link runEngine} can fail fast through its not-found guard instead
 * of attempting to spawn a non-existent file.
 * @type {string|null}
 */
const WORKER_SCRIPT = existsSync(PRIMARY_WORKER_SCRIPT)
  ? PRIMARY_WORKER_SCRIPT
  : existsSync(FALLBACK_WORKER_SCRIPT)
    ? FALLBACK_WORKER_SCRIPT
    : null;

// Stockfish binary path (single-threaded WASM, no SharedArrayBuffer needed)
let STOCKFISH_BIN;
try {
  const pkgDir = path.dirname(_require.resolve('stockfish/package.json'));
  const single = path.join(pkgDir, 'bin', 'stockfish-18-single.js');
  const full   = path.join(pkgDir, 'bin', 'stockfish-18.js');
  STOCKFISH_BIN = existsSync(single) ? single : full;
} catch (e) {
  console.error('[Engine] Could not resolve stockfish binary:', e.message);
}

const TIMEOUT_MS = (() => {
  const env = parseInt(process.env.FUNCTION_TIMEOUT_MS, 10);
  if (!isNaN(env) && env > 0) return Math.max(env - 1500, 1000);
  return 10000;
})();

const router = Router();

function isValidFen(fen) {
  if (!fen || typeof fen !== 'string') return false;
  try { new Chess(fen); return true; } catch { return false; }
}

function getSearchParams(bot) {
  if (!bot) return 'go depth 10';
  let nodes = Math.min(Math.max(Number(bot.nodes) || 10000, 0), 1_000_000);
  let depth = Math.min(Math.max(Number(bot.depth) || 10, 1), 20);
  if (nodes < 5000)  return `go nodes ${nodes}`;
  if (nodes < 50000) return `go movetime ${Math.min(Math.floor(nodes / 10), 1000)}`;
  return `go depth ${Math.min(depth, 12)}`;
}

function runEngine(fen, searchParams, bot, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!STOCKFISH_BIN || !WORKER_SCRIPT) {
      return reject(new Error('Stockfish binary or worker script not found'));
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
      try { child.kill(); } catch {}
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

    // Send UCI commands over stdin
    const commands = [
      'setoption name Hash value 16',
      'setoption name Threads value 1',
    ];
    if (bot?.playStyle) {
      let safeDepth = Math.min(Math.max(Number(bot.depth) || 1, 1), 20);
      commands.push(`setoption name Skill Level value ${Math.min(20, Math.floor(safeDepth * 3.33))}`);
    }
    commands.push('uci', 'ucinewgame', `position fen ${fen}`, searchParams);
    for (const cmd of commands) child.stdin.write(cmd + '\n');
  });
}

router.post('/move', async (req, res) => {
  try {
    const { fen, bot, debug } = req.body;
    if (!fen) return errorResponse(res, 400, 'Missing required field: fen');
    if (!isValidFen(fen)) return errorResponse(res, 400, 'Invalid FEN string');

    const searchParams = getSearchParams(bot);
    if (debug) console.log('[Engine] FEN:', fen, '| Search:', searchParams);

    const result = await runEngine(fen, searchParams, bot, TIMEOUT_MS);

    return res.json({
      type: 'result',
      ...result,
      debugInfo: debug ? { fen, searchParams, botName: bot?.name } : null,
    });
  } catch (error) {
    console.error('[Engine] Move error:', error.message);
    return handleRouteError(res, error, 'Failed to calculate move');
  }
});

export default router;
