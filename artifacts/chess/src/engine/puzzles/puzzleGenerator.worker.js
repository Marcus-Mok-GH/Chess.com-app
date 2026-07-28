import { generatePuzzle } from "./puzzleGenerator";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ puzzle: generatePuzzle(data.seed) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Puzzle generation failed.",
    });
  }
};
