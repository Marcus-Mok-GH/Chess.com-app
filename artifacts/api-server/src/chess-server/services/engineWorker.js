/**
 * Shared Stockfish worker client.
 *
 * Spawns `stockfish-worker.cjs` as a child process that runs the Stockfish
 * WASM engine. Both the gameplay engine route and the puzzle generator use
 * this module so the binary/worker resolution logic lives in one place.
 *
 * The worker reads UCI commands from stdin and writes engine output to
 * stdout. We parse `info ... pv ...` lines to collect candidate moves and
 * resolve when we see the terminating `bestmove` line.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const _require = createRequire(import.meta.url);
const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Worker script: preferred next to this module; fallback one level up (dist/).
const PRIMARY_WORKER_SCRIPT = path.resolve(_dirname, "stockfish-worker.cjs");
const FALLBACK_WORKER_SCRIPT = path.resolve(_dirname, "..", "stockfish-worker.cjs");
export const WORKER_SCRIPT = existsSync(PRIMARY_WORKER_SCRIPT)
  ? PRIMARY_WORKER_SCRIPT
  : existsSync(FALLBACK_WORKER_SCRIPT)
    ? FALLBACK_WORKER_SCRIPT
    : null;

// Stockfish WASM binary (single-threaded, no SharedArrayBuffer needed).
let STOCKFISH_BIN;
try {
  let pkgDir;
  try {
    pkgDir = path.dirname(_require.resolve("stockfish/package.json"));
  } catch {
    pkgDir = path.resolve(process.cwd(), "node_modules", "stockfish");
    if (!existsSync(pkgDir)) {
      pkgDir = path.resolve(_dirname, "..", "..", "..", "node_modules", "stockfish");
    }
  }
  const candidates = [
    path.join(pkgDir, "bin", "stockfish-18-lite-single.js"),
    path.join(pkgDir, "bin", "stockfish-18-single.js"),
    path.join(pkgDir, "bin", "stockfish-18.js"),
    path.join(process.cwd(), "node_modules", "stockfish", "bin", "stockfish-18-lite-single.js"),
  ];
  STOCKFISH_BIN = candidates.find((c) => existsSync(c));
  if (!STOCKFISH_BIN) {
    console.warn("[EngineWorker] Stockfish binary not found. Tried:", candidates);
  }
} catch (e) {
  console.error("[EngineWorker] Could not resolve stockfish binary:", e.message);
}

export function isStockfishConfigured() {
  return Boolean(STOCKFISH_BIN && WORKER_SCRIPT);
}

/**
 * Run a Stockfish search on the given FEN.
 *
 * @param {string} fen - Position to search.
 * @param {object} [options]
 * @param {number} [options.depth=10] - Search depth (1-20 recommended).
 * @param {number} [options.nodes]     - If set, search a node count instead of depth.
 * @param {number} [options.movetime]  - If set, search a fixed time (ms) instead.
 * @param {number} [options.timeoutMs=10000] - Hard timeout for the worker.
 * @param {boolean} [options.multiPv=false] - Request MultiPV output (all root moves scored).
 * @param {string[]} [options.setoptions] - Extra `setoption name X value Y` commands.
 * @returns {Promise<{ bestMove: string, candidates: Array<{move:string,score:number,depth:number,pv?:string[]}> }>}
 */
export function runEngine(fen, options = {}) {
  const {
    depth = 10,
    nodes,
    movetime,
    timeoutMs = 10000,
    multiPv = false,
    setoptions = [],
  } = options;

  return new Promise((resolve, reject) => {
    if (!isStockfishConfigured()) {
      return reject(new Error("Stockfish binary or worker script not found."));
    }

    const child = spawn(process.execPath, [WORKER_SCRIPT, STOCKFISH_BIN], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const candidates = [];
    let outputBuf = "";
    let settled = false;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`Search timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    const parseInfoLine = (line) => {
      // Match e.g. "info depth 12 seldepth 14 multipv 1 score cp 73 ... pv e2e4 e7e5 ..."
      const pvMatch = line.match(/ pv ([\w-]+(?:\s[\w-]+)*)/);
      const moveMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
      const depthMatch = line.match(/depth (\d+)/);
      const scoreMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      if (!moveMatch) return;

      const move = moveMatch[1];
      const d = depthMatch ? parseInt(depthMatch[1], 10) : 0;
      let score = 0;
      if (scoreMatch) score = parseInt(scoreMatch[1], 10);
      else if (mateMatch) score = parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000;

      const pv = pvMatch ? pvMatch[1].split(/\s+/).slice(0, 8) : undefined;
      const existing = candidates.find((m) => m.move === move);
      if (existing) {
        if (d >= existing.depth) {
          existing.score = score;
          existing.depth = d;
          if (pv) existing.pv = pv;
        }
      } else {
        candidates.push({ move, score, depth: d, pv });
      }
    };

    child.stdout.on("data", (data) => {
      outputBuf += data.toString();
      let nl;
      while ((nl = outputBuf.indexOf("\n")) !== -1) {
        const line = outputBuf.slice(0, nl).trim();
        outputBuf = outputBuf.slice(nl + 1);
        if (!line) continue;

        if (line.includes(" pv ")) parseInfoLine(line);

        if (line.startsWith("bestmove")) {
          const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbnQRBN]?)/);
          if (match) {
            settle(() => resolve({ bestMove: match[1], candidates }));
          } else {
            settle(() => reject(new Error("bestmove line had no move: " + line)));
          }
        }
      }
    });

    child.stderr.on("data", (data) => {
      console.error("[Stockfish Worker]", data.toString().trim());
    });

    child.on("error", (err) => settle(() => reject(err)));
    child.on("close", (code) => {
      settle(() => reject(new Error(`Worker exited with code ${code} before bestmove`)));
    });

    const commands = [
      "setoption name Hash value 16",
      "setoption name Threads value 1",
      ...setoptions,
      "uci",
      "ucinewgame",
      `position fen ${fen}`,
    ];

    if (multiPv) commands.push(`setoption name MultiPV value 500`);
    let goCmd;
    if (movetime) goCmd = `go movetime ${movetime}`;
    else if (nodes) goCmd = `go nodes ${nodes}`;
    else goCmd = `go depth ${Math.min(Math.max(depth, 1), 20)}`;
    commands.push(goCmd, "quit");

    child.stdin.write(commands.join("\n") + "\n");
  });
}

export default { runEngine, isStockfishConfigured, WORKER_SCRIPT };
