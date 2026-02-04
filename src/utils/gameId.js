/**
 * Generate a short, URL-friendly game ID.
 * Same format as server (matchmaking): 6 chars from alphanumeric set (no 0/O, 1/I/L).
 */
export function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
