/**
 * Promise-based client for the puzzle generation worker.
 *
 * Puzzles.jsx previously called generatePuzzleForThemes synchronously on the
 * main thread, which froze the app for the duration of the generator's
 * position search. This module runs the exact same generator inside a module
 * worker and resolves with the same puzzle object.
 *
 * If workers are unavailable (older browsers, test environments), or the
 * worker fails to start, it falls back to synchronous generation so puzzle
 * play keeps working everywhere.
 */
import { generatePuzzleForThemes } from "./puzzleGenerator";

let worker = null;
let workerUnavailable = false;
let requestSeq = 0;
const pendingRequests = new Map();

function handleWorkerMessage(event) {
  const { id, puzzle, error } = event.data ?? {};
  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id);
  if (error) pending.reject(new Error(error));
  else pending.resolve(puzzle);
}

function abandonWorker(reason) {
  for (const { reject } of pendingRequests.values()) {
    reject(new Error(reason));
  }
  pendingRequests.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  // Do not keep respawning a worker that failed once; use the synchronous
  // fallback for the rest of the session instead.
  workerUnavailable = true;
}

function getWorker() {
  if (worker) return worker;
  if (workerUnavailable || typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(
      new URL("./puzzleGenerator.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (event) => {
      abandonWorker(
        event?.message || "The puzzle generator worker stopped unexpectedly.",
      );
    };
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/**
 * Generate a puzzle off the main thread. Signature and result match
 * generatePuzzleForThemes exactly.
 */
export async function generatePuzzleForThemesAsync(themes, seed, options) {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return generatePuzzleForThemes(themes, seed, options);
  }
  return new Promise((resolve, reject) => {
    const id = ++requestSeq;
    pendingRequests.set(id, { resolve, reject });
    activeWorker.postMessage({ id, themes, seed, options });
  });
}
