---
name: Stockfish WASM engine setup
description: How to correctly hook into the stockfish npm package's output in Node.js — the Emscripten print function must be set before initialization.
---

## Rule
Do NOT use `stockfish/index.js` directly in the main process and then set `eng.print` after `await stockfish()` resolves. Emscripten captures the `print` reference at `FACTORY()(engine)` call time — setting it afterwards has no effect.

**Why:** stockfish-18-single.js is an Emscripten-compiled WASM module. Inside it, `var print = Module.print || console.log` is evaluated once during module init. The returned engine object's `.print` property is no longer live.

**How to apply:** Spawn a child process (`stockfish-worker.cjs`) that:
1. `require()`s the Emscripten factory directly (`FACTORY = require(enginePath)`)
2. Builds `engine = { locateFile, print: (line) => process.stdout.write(line+'\n'), printErr: ()=>{} }` **before** calling `FACTORY()(engine).then(...)`
3. Reads UCI commands from `process.stdin` and forwards via `engine.sendCommand`
4. Parent process reads `bestmove` lines from `child.stdout`

Worker script: `artifacts/api-server/src/chess-server/stockfish-worker.cjs`
Copied to `dist/` by `build.mjs`. Path resolved via `path.resolve(_dirname, 'stockfish-worker.cjs')` where `_dirname = path.dirname(fileURLToPath(import.meta.url))` (the dist/ directory of the bundled index.mjs).
