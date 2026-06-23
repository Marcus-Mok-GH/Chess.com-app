import nodemailer from 'nodemailer';

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

  const transport = createTransport();

  if (!transport) {
    console.log(`\n[OTP] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[OTP]  No SMTP configured — code for ${to}:`);
    console.log(`[OTP]  >>>  ${code}  <<<`);
    console.log(`[OTP] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transport.sendMail({ from, to, subject, text, html });
  console.log(`[OTP] Sent verification code to ${to}`);
}
