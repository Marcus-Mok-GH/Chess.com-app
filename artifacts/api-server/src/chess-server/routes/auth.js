import express from 'express';
import crypto from 'crypto';
import { query } from '../db/query.js';
import {
  createSession,
  validateSession,
  deleteSession,
} from '../auth.js';
import { sendOtpEmail } from '../mailer.js';

const router = express.Router();

const OTP_TTL_MINUTES = 10;

function generateOtp() {
  return String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');
}

// POST /api/auth/email-otp/send-verification-otp
// Called by better-auth/client emailOTPClient — sends a 6-digit code to the given email.
router.post('/email-otp/send-verification-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: { message: 'Email is required.' } });
  }

  try {
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await query(
      `INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
      [email.toLowerCase().trim(), code, expiresAt]
    );

    await sendOtpEmail({ to: email, code });

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('[Auth] send-otp error:', err);
    return res.status(500).json({ error: { message: 'Failed to send code. Please try again.' } });
  }
});

// POST /api/auth/sign-in/email-otp
// Called by better-auth/client signIn.emailOtp — verifies the code and signs the user in.
router.post('/sign-in/email-otp', async (req, res) => {
  const { email, otp, name } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: { message: 'Email and code are required.' } });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const otpResult = await query(
      `SELECT id, code, expires_at, used FROM otp_codes
       WHERE email = $1 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: { message: 'No active code found. Please request a new one.' } });
    }

    const row = otpResult.rows[0];

    if (new Date() > new Date(row.expires_at)) {
      return res.status(400).json({ error: { message: 'Code has expired. Please request a new one.' } });
    }

    if (row.code !== String(otp).trim()) {
      return res.status(400).json({ error: { message: 'Invalid code. Please try again.' } });
    }

    await query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [row.id]);

    let user;
    const existing = await query(
      `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const username = (name || '').trim() || `player_${crypto.randomBytes(4).toString('hex')}`;
      const safeUsername = username.slice(0, 20).replace(/[^a-zA-Z0-9_-]/g, '_');

      const finalUsername = await resolveUniqueUsername(safeUsername);
      const newUser = await query(
        `INSERT INTO users (id, username, email) VALUES (gen_random_uuid()::TEXT, $1, $2)
         RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email`,
        [finalUsername, normalizedEmail]
      );
      user = newUser.rows[0];
    }

    const token = await createSession(user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      data: {
        session: { token },
        user: {
          id: user.id,
          username: user.username,
          name: user.username,
          email: user.email,
          elo: user.elo,
          gamesPlayed: user.games_played,
          wins: user.wins,
          losses: user.losses,
          draws: user.draws,
          createdAt: user.created_at,
        },
      },
      error: null,
    });
  } catch (err) {
    console.error('[Auth] sign-in/email-otp error:', err);
    return res.status(500).json({ error: { message: 'Sign-in failed. Please try again.' } });
  }
});

async function resolveUniqueUsername(base) {
  const check = await query(`SELECT id FROM users WHERE username = $1`, [base]);
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  const candidate = `${base.slice(0, 16)}_${suffix}`;
  const check2 = await query(`SELECT id FROM users WHERE username = $1`, [candidate]);
  return check2.rows.length === 0 ? candidate : `player_${crypto.randomBytes(4).toString('hex')}`;
}

// GET /api/auth/get-session (better-auth client calls this endpoint)
router.get('/get-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });
  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });
    const result = await query(
      'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });
    const u = result.rows[0];
    res.json({
      session: { token },
      user: { id: u.id, username: u.username, name: u.username, email: u.email, elo: u.elo },
    });
  } catch {
    res.json({ session: null, user: null });
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });

    const result = await query(
      'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });

    const u = result.rows[0];
    res.json({
      session: { token },
      user: {
        id: u.id,
        username: u.username,
        name: u.username,
        email: u.email,
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
router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try {
    await deleteSession(token);
  } catch {
    // always succeed on signout
  }
  res.json({ success: true });
});

export default router;
