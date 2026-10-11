/**
 * Shared difficulty metadata for generated puzzles.
 *
 * The Stockfish and AI generation paths both label their output with the same
 * rating, so a puzzle's rating does not depend on which backend produced it.
 * Unknown/missing difficulties fall back to the medium rating.
 */

const RATING_BY_DIFFICULTY = Object.freeze({
  easy: 900,
  medium: 1300,
  hard: 1700,
  expert: 2100,
});

const DEFAULT_RATING = RATING_BY_DIFFICULTY.medium;

/** Estimated rating shown for a puzzle generated at the given difficulty. */
export function ratingForDifficulty(difficulty) {
  return RATING_BY_DIFFICULTY[difficulty] ?? DEFAULT_RATING;
}
