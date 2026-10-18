import { query } from './db.js';
import { getSessionTokenFromHeaders, validateSession } from './auth.js';
import { isIntegrityReviewer } from './services/antiCheatService.js';

// The minimal user columns the SSR renderer embeds into the personalized
// HTML payload. The payload must mirror the exact user object
// UserContext builds from `GET /api/auth/session` (username, ratings,
// game record, needsUsername, isAdmin) so the first client render is
// indistinguishable from the server-rendered one.
const SSR_USER_COLUMNS =
  'id, username, email, elo, bullet_elo, rapid_elo, classical_elo, blitz_elo, games_played, wins, losses, draws, created_at';

/**
 * Maps a users-table row to the same flat user object the client context
 * keeps in state. Intentionally identical to the `shapeUser` + the
 * UserContext mapping pair so the seeded renderer state and the client
 * state agree field by field.
 */
function shapeSsrUser(row) {
  const username = row.username || row.name || '';
  return {
    id: row.id,
    username,
    email: row.email ?? null,
    elo: row.elo ?? 1200,
    rapidElo: row.rapid_elo ?? row.elo ?? 1200,
    classicalElo: row.classical_elo ?? row.elo ?? 1200,
    blitzElo: row.blitz_elo ?? row.elo ?? 1200,
    bulletElo: row.bullet_elo ?? row.elo ?? 1200,
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    createdAt: row.created_at ?? null,
    // Mirrors shapeUser in routes/auth.js: server-assigned default
    // usernames (player_xxxxxxxx) should pick a real name after sign-in.
    needsUsername: String(username).startsWith('player_'),
    isAdmin: isIntegrityReviewer(row.id),
  };
}

/**
 * Resolves the signed-in user for a server-side render from the incoming
 * request headers. Bearer token first, then the httpOnly `chess_session`
 * cookie — the same precedence every API route uses.
 *
 * Returns the user object for a valid session, or null when the request is
 * anonymous or the token is invalid/expired/banned. Throwing is reserved for
 * infrastructure failures (DB unreachable); the SSR caller treats every
 * outcome as "maybe personalized" and degrades to the anonymous shell rather
 * than failing the render.
 *
 * The returned object never contains session tokens — the httpOnly cookie
 * remains the only credential carrier; this payload is pure profile data.
 */
export async function getSessionUserFromHeaders(headers = {}) {
  const token = getSessionTokenFromHeaders(headers || {});
  if (!token) return null;

  const userId = await validateSession(token);
  if (!userId) return null;

  const result = await query(`SELECT ${SSR_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  const row = result?.rows?.[0];
  if (!row) return null;

  const ssrUser = shapeSsrUser(row);
  // Without a username the client would adopt a user that can never be
  // persisted (persistUser bails on a missing username), so such rows are
  // rendered anonymous and left to the normal client session flow.
  return ssrUser.username ? ssrUser : null;
}
