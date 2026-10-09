// The lesson-puzzle builder used by the API is the same implementation the
// browser and the SSR render use, so a puzzle produced here is identical to
// the one the client would generate for the same lesson, seed and difficulty.
export {
  buildLessonPuzzle,
  isLessonPuzzleDifficulty,
  randomPuzzleSeed,
  LESSON_PUZZLE_DIFFICULTIES,
  DEFAULT_LESSON_PUZZLE_DIFFICULTY,
} from "../../../../chess/src/engine/puzzles/lessonPuzzle.js";
