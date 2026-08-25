// Keep API and browser puzzle generation on one verified implementation.
// The shared generator samples legal positions and prefers non-mating material
// tactics; it only uses the lesson fallback for explicitly requested mates or
// when local sampling cannot produce a legal tactical opportunity.
export {
  generatePuzzle,
  generatePuzzleAsync,
  validateGeneratedPuzzle,
} from "../../../../chess/src/engine/puzzles/puzzleGenerator.js";
