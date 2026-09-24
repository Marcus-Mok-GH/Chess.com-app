/**
 * Puzzle generation worker.
 *
 * Generating a puzzle is a search: the generator samples up to ~96 candidate
 * positions and plays each one out with chess.js, which can take hundreds of
 * milliseconds. Running that on the main thread froze the whole app whenever
 * the puzzles page loaded a new lesson. This worker keeps the UI responsive by
 * running the same generator off the main thread.
 */
import { generatePuzzleForThemes } from "./puzzleGenerator";

self.onmessage = (event) => {
  const { id, themes, seed, options } = event.data ?? {};
  if (typeof id !== "number") return;
  try {
    const puzzle = generatePuzzleForThemes(themes, seed, options);
    self.postMessage({ id, puzzle });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
