/**
 * Auth routes — Neon Auth proxy.
 *
 * The app now delegates email-OTP sign-in to Neon's hosted auth (Better Auth
 * under the hood). The React client talks to Neon directly; this router
 * remains so the rest of the app can still read the merged app user
 * (elo, username, needsUsername, …) through the existing `/api/auth/*`
 * endpoints and so username updates can be made against our `users` table.
 *
 * Routes:
 *   GET  /session              – resolve the Neon session cookie → app user
 *   POST /signout              – best-effort sign-out (cookie is cleared on
 *                                the Neon auth host by the React client)
 *   POST /update-username      – update the local `users.username` row
 */

import express from 'express';
import { query } from '../db/query.js';
import { verifyRequest, loadAppUser } from '../neonAuthServer.js';

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

function buildAppUserResponse(user) {
  if (!user) return null;
  const needsUsername = !user.username || String(user.username).startsWith('player_');
  return {
    id: user.id,
    username: user.username,
    name: user.username,
    email: user.email,
    elo: user.elo ?? 1200,
    gamesPlayed: user.games_played ?? 0,
    wins: user.wins ?? 0,
    losses: user.losses ?? 0,
    draws: user.draws ?? 0,
    createdAt: user.created_at,
    emailVerified: !!user.email_verified,
    needsUsername,
  };
}

router.get('/session', async (req, res) => {
  try {
    const result = await verifyRequest(req);
    if (!result?.user) {
      return res.json({ session: null, user: null });
    }
    return res.json({
      session: {
        id: result.session.id,
        token: result.session.token,
        userId: result.user.id,
        expiresAt: result.session.expiresAt,
      },
      user: buildAppUserResponse(result.user),
    });
  } catch (err) {
    console.error('[Auth] session lookup error:', err.message);
    return res.json({ session: null, user: null });
  }
});

router.post('/signout', async (_req, res) => {
  // The React client calls Neon Auth's signOut() directly, which clears the
  // session cookie on the Neon auth host. This endpoint exists so callers
  // can post a best-effort sign-out and the UI can show a success state.
  return res.json({ success: true });
});

router.post('/update-username', async (req, res) => {
  try {
    const { username } = req.body || {};
    const trimmed = String(username || '').trim();
    if (trimmed.length < 2 || trimmed.length > 20 || !USERNAME_RE.test(trimmed)) {
      return res.status(400).json({ error: { message: 'Username must be 2-20 characters (letters, numbers, . _ -).' } });
    }

    const verified = await verifyRequest(req);
    if (!verified?.user) {
      return res.status(401).json({ error: { message: 'Session expired.' } });
    }
    const userId = verified.user.id;

    const taken = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id::TEXT <> $2::TEXT',
      [trimmed, userId]
    );
    if (taken.rows.length > 0) {
      return res.status(400).json({ error: { message: 'Username taken.' } });
    }

    const updated = await query(
      `UPDATE users SET username = $1, updated_at = NOW()
        WHERE id::TEXT = $2::TEXT
        RETURNING id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified`,
      [trimmed, userId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: { message: 'User not found.' } });
    }
    const u = updated.rows[0];
    return res.json({ success: true, user: buildAppUserResponse(u) });
  } catch (err) {
    console.error('[Auth] update-username error:', err.message);
    return res.status(500).json({ error: { message: 'Update failed.' } });
  }
});

export default router;
