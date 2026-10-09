import { generatePuzzle, normalizeSeed } from "./puzzleGenerator.js";

/**
 * Lesson puzzles are shared by three callers that must agree on the produced
 * shape: the SSR render of /puzzles, the `GET /api/puzzles/lesson` endpoint
 * (which lets slow devices skip local generation) and the client's local
 * fallback generator.
 *
 * The builder uses `generatePuzzle` (the fast path, ~170ms measured) instead
 * of `generatePuzzleForThemes` (the themed search runs up to 50 full
 * attempts, ~3.6s, and every theme in the lesson catalog misses so it falls
 * back to exactly this call). The returned object mirrors what
 * generatePuzzleForThemes() resolves with for a lesson — `lesson-<seed>` id,
 * normalized lesson themes, lesson metadata, requested difficulty — so a
 * puzzle from any of the callers is interchangeable.
 */

/** Difficulty levels the generator supports (mirrors DIFFICULTY_PROFILES). */
export const LESSON_PUZZLE_DIFFICULTIES = [
  "beginner",
  "easy",
  "intermediate",
  "advanced",
];

export const DEFAULT_LESSON_PUZZLE_DIFFICULTY = "beginner";

export function randomPuzzleSeed() {
  return Date.now() ^ Math.floor(Math.random() * 0xffffffff);
}

export function isLessonPuzzleDifficulty(value) {
  return LESSON_PUZZLE_DIFFICULTIES.includes(String(value ?? "").toLowerCase());
}

export function normalizeLessonPuzzleDifficulty(value) {
  return isLessonPuzzleDifficulty(value)
    ? String(value).toLowerCase()
    : DEFAULT_LESSON_PUZZLE_DIFFICULTY;
}

/**
 * Builds one lesson puzzle synchronously.
 *
 * @param {Object} options
 * @param {Object} options.lesson Lesson catalog entry (id/title/topic/order/puzzleThemes).
 * @param {number} [options.lessonIndex] Position of the lesson in the caller's catalog.
 * @param {number} [options.seed] Seed for the deterministic generator.
 * @param {string} [options.difficulty] One of LESSON_PUZZLE_DIFFICULTIES.
 * @returns {Object} The generated puzzle (throws if generation fails).
 */
export function buildLessonPuzzle({
  lesson,
  lessonIndex = 0,
  seed = randomPuzzleSeed(),
  difficulty = DEFAULT_LESSON_PUZZLE_DIFFICULTY,
} = {}) {
  const entry = lesson || {};
  const level = normalizeLessonPuzzleDifficulty(difficulty);
  const lessonThemes = (Array.isArray(entry.puzzleThemes) ? entry.puzzleThemes : [])
    .map((theme) => String(theme).trim())
    .filter(Boolean);
  const freshPuzzle = generatePuzzle(seed, { difficulty: level });

  return {
    ...freshPuzzle,
    // Same id/lessonThemes contract generatePuzzleForThemes() returns.
    id: `lesson-${normalizeSeed(seed)}`,
    lessonThemes,
    lessonIndex,
    lessonTitle: entry.title,
    lessonTopic: entry.topic,
    lessonOrder: entry.order,
    difficulty: level,
  };
}
