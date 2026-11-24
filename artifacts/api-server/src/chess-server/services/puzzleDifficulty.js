/**
 * Shared puzzle difficulty → rating mapping used by the AI and Stockfish
 * puzzle generators so both stay on the same scale.
 */
export function ratingForDifficulty(difficulty) {
  return { easy: 900, medium: 1300, hard: 1700, expert: 2100 }[difficulty] ?? 1300;
}
