#!/usr/bin/env node
// Stockfish worker — spawned as a child process by engine.js.
// We replicate the internals of stockfish/index.js so we can set engine.print
// BEFORE calling INIT_ENGINE()(engine) — Emscripten captures the print
// reference at init time, so it must be in place before initialization.

'use strict';

const enginePath = process.argv[2];
if (!enginePath) {
  process.stderr.write('Usage: stockfish-worker.cjs <path-to-stockfish.js>\n');
  process.exit(1);
}

const fs   = require('fs');
const path = require('path');

const ext      = path.extname(enginePath);
const basePath = enginePath.slice(0, -ext.length);
const wasmPath = basePath + '.wasm';
const basename = path.basename(basePath);
const engineDir = path.dirname(enginePath);

// Load the emscripten factory.
const FACTORY = require(enginePath);

// Build the engine object WITH print set before calling the factory.
const engine = {
  locateFile: (filename) => {
    if (filename.endsWith('.wasm.map')) return wasmPath + '.map';
    if (filename.endsWith('.wasm'))    return wasmPath;
    return enginePath;
  },
  // Called for every output line from Stockfish (UCI info, bestmove, etc.)
  print: (line) => {
    process.stdout.write(line + '\n');
  },
  printErr: () => {},
};

// Assemble split WASM parts if present (mirrors stockfish/index.js).
const buffers = [];
fs.readdirSync(engineDir).sort().forEach((filename) => {
  if (filename.startsWith(basename + '-part-') && filename.endsWith('.wasm')) {
    buffers.push(fs.readFileSync(path.join(engineDir, filename)));
  }
});
if (buffers.length) engine.wasmBinary = Buffer.concat(buffers);

// Initialize — FACTORY() returns the emscripten module constructor.
FACTORY()(engine).then(() => {
  // Wait for _isReady if the engine exposes it.
  function waitReady(cb) {
    if (engine._isReady && !engine._isReady()) {
      return setTimeout(() => waitReady(cb), 10);
    }
    if (engine._isReady) delete engine._isReady;
    cb();
  }

  waitReady(() => {
    // sendCommand is installed by stockfish/index.js, but since we bypassed it,
    // wire it up ourselves using the same approach.
    const sendCmd = (cmd) => {
      if (typeof engine.sendCommand === 'function') {
        engine.sendCommand(cmd);
      } else if (typeof engine.ccall === 'function') {
        setImmediate(() => {
          engine.ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) });
        });
      } else if (typeof engine.postMessage === 'function') {
        engine.postMessage(cmd);
      }
    };

    // Wire sendCommand on the engine for convenience.
    if (!engine.sendCommand) {
      engine.sendCommand = (cmd) => {
        setImmediate(() => {
          engine.ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) });
        });
      };
    }

    // Forward stdin lines as UCI commands.
    process.stdin.setEncoding('utf8');
    let buf = '';
    process.stdin.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) sendCmd(line);
      }
    });
    process.stdin.on('end', () => process.exit(0));
  });
}).catch((err) => {
  process.stderr.write('Stockfish init error: ' + err.message + '\n');
  process.exit(1);
});
