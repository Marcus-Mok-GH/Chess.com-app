/**
 * Generate a short, URL-friendly game ID.
 * Same format as server (matchmaking): 6 chars from alphanumeric set (no 0/O, 1/I/L).
 */
const GAME_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_ID_LENGTH = 6;

export function generateGameId() {
  return Array.from({ length: GAME_ID_LENGTH }, () => (
    GAME_ID_ALPHABET[Math.floor(Math.random() * GAME_ID_ALPHABET.length)]
  )).join('');
}
