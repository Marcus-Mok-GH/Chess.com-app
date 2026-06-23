import express from 'express';
import { query } from '../db/query.js';
import {
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';

const router = express.Router();

// GET /api/auth/get-session (better-auth client calls this endpoint)
router.get('/get-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });
  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });
    const result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });
    const u = result.rows[0];
    res.json({ session: { token }, user: { id: u.id, username: u.username, elo: u.elo } });
  } catch {
    res.json({ session: null, user: null });
  }
});

// GET /api/auth/session
// Returns the current user from a Bearer token
router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.json({ session: null, user: null });

  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });

    const result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) return res.json({ session: null, user: null });

    const u = result.rows[0];
    res.json({
      session: { token },
      user: {
        id: u.id,
        username: u.username,
        elo: u.elo,
        gamesPlayed: u.games_played,
        wins: u.wins,
        losses: u.losses,
        draws: u.draws,
        createdAt: u.created_at,
      },
    });
  } catch (error) {
    console.error('[Auth] session error:', error);
    res.json({ session: null, user: null });
  }
});

// POST /api/auth/signout
// Invalidates the session token
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;

  try {
    await deleteSession(token);
  } catch {
    // Always succeed on signout — never block the user from logging out
  }

  res.json({ success: true });
});

export default router;
