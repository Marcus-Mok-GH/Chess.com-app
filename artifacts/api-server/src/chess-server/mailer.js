/**
 * OTP email delivery for the native email-OTP flow.
 *
 * Priority:
 *   1. RESEND_API_KEY → POST https://api.resend.com/emails
 *   2. SMTP_HOST + SMTP_USER + SMTP_PASS → SMTP transport (dev / self-host)
 *   3. No mailer configured → dev fallback: log the code to stdout so the
 *      OTP endpoint still succeeds locally without external email creds.
 *
 * The native flow (using the local `verifications` table) was reinstated as
 * a safety net so the login form keeps working when the upstream Neon Auth
 * proxy is unreachable or the project is misconfigured. With this in place,
 * `routes/auth.js` no longer hard-fails when `NEON_AUTH_BASE_URL` is unset
 * or the Better Auth `emailOTP` plugin is not enabled on the Neon project.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

let _nodemailer = null;
async function getNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    const mod = await import('nodemailer');
    _nodemailer = mod.default || mod;
    return _nodemailer;
  } catch {
    return null;
  }
}

async function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (host && user && pass) {
    const nm = await getNodemailer();
    if (!nm) {
      console.warn('[Auth] SMTP configured but nodemailer module not available — falling back to dev console logger');
      return null;
    }
    return nm.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  return null;
}

async function sendViaResend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API ${res.status}: ${body || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendOtpEmail({ to, code }) {
  const subject = 'Your Chess sign-in code';
  const text = `Your verification code is: ${code}\n\nIt expires in 10 minutes. Do not share it with anyone.`;
  const html = `
    <div style="font-family:sans-serif;max-width:400px;margin:auto">
      <h2 style="color:#2d4a2d">♟ Chess – Sign-in code</h2>
      <p style="font-size:16px">Use this code to sign in. It expires in <strong>10 minutes</strong>.</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px 0;color:#1a1a1a">${code}</div>
      <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore it.</p>
    </div>`;

  // 1) Resend — production path, works on serverless.
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || 'Chess <onboarding@resend.dev>';
    try {
      await sendViaResend({ from, to, subject, text, html });
      console.log(`[OTP] Sent verification code via Resend to ${to}`);
      return;
    } catch (err) {
      console.error('[Auth] sendOtpEmail (Resend) failed:', err.message);
      throw err;
    }
  }

  // 2) SMTP fallback for self-hosted / dev environments.
  const transport = await createTransport();
  if (transport) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transport.sendMail({ from, to, subject, text, html });
    console.log(`[OTP] Sent verification code via SMTP to ${to}`);
    return;
  }

  // 3) No mailer configured — dev/test fallback: log the code to stdout so
  //    the OTP flow still succeeds locally without external email creds.
  //    This prevents the OTP endpoint from returning 500 in environments
  //    without RESEND_API_KEY or SMTP_* configured, and keeps the app
  //    working when the upstream Neon Auth proxy is misconfigured.
  console.warn(
    '[Auth] No mailer configured — logging OTP to console (dev fallback). ' +
      'Set RESEND_API_KEY (or SMTP_*) for production delivery.'
  );
  console.log(`[OTP-DEV] Code for ${to}: ${code}`);
  return;
}
