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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DAYS = 7;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function hashCode(code, salt) {
  try {
    if (!salt) throw new Error('invalid salt');
    // salt is stored as hex string; convert to Buffer for scrypt
    const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt), 'hex');
    return crypto.scryptSync(String(code), saltBuf, 32).toString('hex');
  } catch (e) {
    return '';
  }
}

function generateCode() {
  // 6-digit numeric code, leading zeros preserved.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

async function findActiveVerification(identifier) {
  const result = await query(
    `SELECT id, code_hash, salt, expires_at, attempts, created_at
       FROM verifications
      WHERE identifier = $1 AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [identifier]
  );
  return result.rows[0] || null;
}

async function invalidatePrevious(identifier) {
  await query(
    `UPDATE verifications SET consumed_at = NOW()
      WHERE identifier = $1 AND consumed_at IS NULL`,
    [identifier]
  );
}

async function findOrCreateUser(email) {
  let existing = await query(
    `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email, email_verified
       FROM users WHERE email = $1`,
    [email]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const baseUsername = `player_${crypto.randomBytes(4).toString('hex')}`;
  const finalUsername = await resolveUniqueUsername(baseUsername);
  try {
    const inserted = await query(
      `INSERT INTO users (id, username, email, email_verified)
       VALUES (gen_random_uuid()::TEXT, $1, $2, TRUE)
       RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email, email_verified`,
      [finalUsername, email]
    );
    return inserted.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      // race or duplicate email/username, fetch existing
      existing = await query(
        `SELECT id, username, elo, games_played, wins, losses, draws, created_at, email, email_verified
           FROM users WHERE email = $1`,
        [email]
      );
      if (existing.rows.length > 0) return existing.rows[0];
    }
    throw err;
  }
}

async function resolveUniqueUsername(base) {
  const check = await query(
    `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
    [base]
  );
  if (check.rows.length === 0) return base;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base.slice(0, 15)}_${suffix}`;
}

async function sendOtp({ email, resend }) {
  try {
    const normalized = normalizeEmail(email);
    if (!EMAIL_RE.test(normalized)) {
      return { ok: false, status: 400, message: 'A valid email is required.' };
    }

    // Enforce cooldown for all OTP sends (initial and resend) to prevent mailer abuse.
    const recent = await query(
      `SELECT created_at FROM verifications
        WHERE identifier = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [normalized]
    );
    if (recent.rows[0]) {
      const lastCreated = new Date(recent.rows[0].created_at).getTime();
      const elapsed = (Date.now() - lastCreated) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        return {
          ok: false,
          status: 429,
          message: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s before requesting a new code.`,
        };
      }
    }

    // Invalidate any outstanding code before issuing a new one.
    await invalidatePrevious(normalized);

    const code = generateCode();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashCode(code, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // `value` is required on production's verifications table — the table was
    // originally provisioned by Better Auth with a `value TEXT NOT NULL` column,
    // and our schema migration only ADDs the columns it actually reads. We store
    // the OTP in `code_hash` + `salt`; `value` is set to a stable marker so the
    // NOT NULL constraint is satisfied on every install (old and new).
    await query(
      `INSERT INTO verifications (identifier, code_hash, salt, value, expires_at)
       VALUES ($1, $2, $3, 'native-email-otp', $4)`,
      [normalized, codeHash, salt, expiresAt]
    );

    try {
      await sendOtpEmail({ to: normalized, code });
    } catch (err) {
      console.error('[Auth] sendOtpEmail failed:', err.message);
      return {
        ok: false,
        status: 500,
        message: 'Failed to send code. Please try again in a moment.',
      };
    }

    return { ok: true, status: 200, message: 'Verification code sent.' };
  } catch (err) {
    console.error('[Auth] sendOtp error:', err);
    return {
      ok: false,
      status: 500,
      message: 'Failed to send verification code. Please try again.',
    };
  }
}

// POST /api/auth/email-otp/send-verification-otp
router.post('/email-otp/send-verification-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await sendOtp({ email, resend: false });
    if (!result.ok) {
      return res.status(result.status).json({ error: { message: result.message } });
    }
    return res.status(result.status).json({ success: true, message: result.message });
  } catch (err) {
    console.error('[Auth] send-verification-otp handler error:', err);
    return res.status(500).json({ error: { message: 'Failed to process verification request.' } });
  }
});

// POST /api/auth/email-otp/resend
router.post('/email-otp/resend', async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await sendOtp({ email, resend: true });
    if (!result.ok) {
      return res.status(result.status).json({ error: { message: result.message } });
    }
    return res.status(result.status).json({ success: true, message: result.message });
  } catch (err) {
    console.error('[Auth] resend handler error:', err);
    return res.status(500).json({ error: { message: 'Failed to process resend request.' } });
  }
});

// POST /api/auth/sign-in/email-otp
router.post('/sign-in/email-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const normalized = normalizeEmail(email);
    const code = String(otp || '').trim();

    if (!EMAIL_RE.test(normalized) || !code) {
      return res.status(400).json({ error: { message: 'Email and code are required.' } });
    }

    const verification = await findActiveVerification(normalized);
    if (!verification) {
      return res.status(400).json({
        error: { message: 'Your code has expired or was never issued. Please request a new one.' },
      });
    }

    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      await invalidatePrevious(normalized);
      return res.status(429).json({
        error: { message: 'Too many incorrect attempts. Please request a new code.' },
      });
    }

    const expectedHash = verification.code_hash;
    const candidateHash = hashCode(code, verification.salt);
    let matches = false;
    if (expectedHash && candidateHash && expectedHash.length === candidateHash.length) {
      try {
        const expBuf = Buffer.from(String(expectedHash), 'hex');
        const candBuf = Buffer.from(String(candidateHash), 'hex');
        if (expBuf.length === candBuf.length && expBuf.length === 32) {
          matches = crypto.timingSafeEqual(expBuf, candBuf);
        }
      } catch {
        matches = false;
      }
    }

    if (!matches) {
      await query(
        `UPDATE verifications SET attempts = attempts + 1 WHERE id = $1`,
        [verification.id]
      );
      const remaining = OTP_MAX_ATTEMPTS - (verification.attempts + 1);
      return res.status(400).json({
        error: { message: `Incorrect code. ${remaining > 0 ? `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Please request a new code.'}` },
      });
    }

    // Mark code consumed.
    await query(
      `UPDATE verifications SET consumed_at = NOW() WHERE id = $1`,
      [verification.id]
    );

    // Find or create the user.
    const user = await findOrCreateUser(normalized);
    const token = await createSession(user.id, {
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });
    const needsUsername = String(user.username).startsWith('player_');

    return res.json({
      session: {
        id: token,
        token: token,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      },
      user: {
        ...user,
        name: user.username,
        elo: user.elo ?? 1200,
        gamesPlayed: user.games_played ?? 0,
        wins: user.wins ?? 0,
        losses: user.losses ?? 0,
        draws: user.draws ?? 0,
        needsUsername,
      },
    });
  } catch (err) {
    console.error('[Auth] Verify OTP Error:', err);
    return res.status(500).json({ error: { message: 'Verification failed. Please try again.' } });
  }
});

router.post('/update-username', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: { message: 'Session token missing' } });

    const { username } = req.body || {};
    const trimmed = (username || '').trim();

    if (trimmed.length < 2 || trimmed.length > 20 || !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      return res.status(400).json({ error: { message: 'Username must be 2-20 characters.' } });
    }

    const userId = await validateSession(token);
    if (!userId) return res.status(401).json({ error: { message: 'Session expired.' } });

    const check = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id::TEXT != $2::TEXT',
      [trimmed, userId]
    );
    if (check.rows.length > 0) return res.status(400).json({ error: { message: 'Username taken.' } });

    const result = await query(
      'UPDATE users SET username = $1 WHERE id::TEXT = $2::TEXT RETURNING id, username, elo, games_played, wins, losses, draws, created_at, email',
      [trimmed, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: { message: 'User not found.' } });

    const u = result.rows[0];
    return res.json({ success: true, user: { ...u, name: u.username, needsUsername: false } });
  } catch (error) {
    console.error('[Auth] update-username error:', error);
    return res.status(500).json({ error: { message: 'Update failed.' } });
  }
});

router.get('/session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.json({ session: null, user: null });

  try {
    const userId = await validateSession(token);
    if (!userId) return res.json({ session: null, user: null });

    const result = await query(
      'SELECT id, username, email, elo, games_played, wins, losses, draws, created_at, email_verified FROM users WHERE id::TEXT = $1::TEXT',
      [userId]
    );
    if (result.rows.length === 0) return res.json({ session: null, user: null });

    const u = result.rows[0];
    const needsUsername = String(u.username).startsWith('player_');

    return res.json({
      session: { id: token, token: token, userId: u.id },
      user: {
        ...u,
        name: u.username,
        elo: u.elo ?? 1200,
        gamesPlayed: u.games_played ?? 0,
        wins: u.wins ?? 0,
        losses: u.losses ?? 0,
        draws: u.draws ?? 0,
        needsUsername,
      },
    });
  } catch (error) {
    return res.json({ session: null, user: null });
  }
});

router.post('/signout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  try { await deleteSession(token); } catch { }
  res.json({ success: true });
});

export default router;
