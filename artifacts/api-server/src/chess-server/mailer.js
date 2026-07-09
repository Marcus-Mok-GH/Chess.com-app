import nodemailer from 'nodemailer';

const RESEND_API_URL = 'https://api.resend.com/emails';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (host && user && pass) {
    return nodemailer.createTransport({
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

  // 1) Resend takes priority — it's the production path and works on serverless.
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || 'Chess <onboarding@resend.dev>';
    try {
      await sendViaResend({ from, to, subject, text, html });
      console.log(`[OTP] Resent via Resend to ${to}`);
      return;
    } catch (err) {
      console.error('[Auth] sendOtpEmail (Resend) failed:', err.message);
      throw err;
    }
  }

  // 2) SMTP fallback for self-hosted / dev environments.
  const transport = createTransport();
  if (transport) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transport.sendMail({ from, to, subject, text, html });
    console.log(`[OTP] Sent verification code via SMTP to ${to}`);
    return;
  }

  // 3) No mailer configured — surface an error so the route returns 500
  //    instead of silently swallowing the email.
  throw new Error(
    'No mailer configured. Set RESEND_API_KEY (production) or SMTP_HOST/USER/PASS (self-hosted).'
  );
}
