import express from 'express';
import crypto from 'crypto';
import { query } from '../db/query.js';
import {
  generateAndStoreOtp,
  sendOtpEmail,
  validateOtp,
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';

const router = express.Router();

// POST /api/auth/send-otp
// Step 1: generate and email a 6-digit OTP
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalized = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const otp = await generateAndStoreOtp(normalized);
    await sendOtpEmail({ to: normalized, otp });
    res.json({ success: true });
  } catch (error) {
    console.error('[Auth] send-otp error:', error.message);
    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// POST /api/auth/verify-otp
// Step 2: validate code, upsert user, return session token
router.post('/verify-otp', async (req, res) => {
  const { email, otp, username } = req.body;

  if (!email || !otp || !username) {
    return res.status(400).json({ error: 'Email, code, and username are required' });
  }

  const trimmedUsername = username.trim();
  if (
    trimmedUsername.length < 2 ||
    trimmedUsername.length > 20 ||
    !/^[a-zA-Z0-9_]+$/.test(trimmedUsername)
  ) {
    return res.status(400).json({ error: 'Username must be 2–20 alphanumeric characters or underscores' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const valid = await validateOtp(normalizedEmail, otp.trim());
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or expired code. Please try again.' });
    }

    const now = new Date();

    // Look up existing user by email
    const existing = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );

    let user;
    let isNewUser = false;

    if (existing.rows.length > 0) {
      user = existing.rows[0];
      await query(
        'UPDATE users SET email_verified = TRUE, updated_at = $1 WHERE id = $2',
        [now, user.id]
      );
    } else {
      // Verify username is available before creating
      const taken = await query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
        [trimmedUsername]
      );
      if (taken.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
      }

      const newId = crypto.randomUUID();
      await query(
        `INSERT INTO users (id, username, email, email_verified, elo, games_played, wins, losses, draws, created_at, updated_at)
         VALUES ($1, $2, $3, TRUE, 1200, 0, 0, 0, 0, $4, $4)`,
        [newId, trimmedUsername, normalizedEmail, now]
      );

      // Also ensure user_settings row exists
      await query(
        `INSERT INTO user_settings (user_id, settings) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING`,
        [newId]
      ).catch(() => { /* user_settings may not exist yet, non-fatal */ });

      const fresh = await query(
        'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
        [newId]
      );
      user = fresh.rows[0];
      isNewUser = true;
    }

    const token = await createSession(user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        elo: user.elo,
        gamesPlayed: user.games_played,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        createdAt: user.created_at,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('[Auth] verify-otp error:', error.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
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
    console.error('[Auth] session error:', error.message);
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
