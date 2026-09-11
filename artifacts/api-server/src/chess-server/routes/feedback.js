import express from 'express';
import { createRateLimiter, requestIp } from '../middleware/rateLimit.js';

const router = express.Router();

const FEEDBACK_LABELS = {
  suggestion: 'Suggestion',
  bug: 'Bug Report',
  praise: 'Praise',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API_URL = 'https://api.resend.com/emails';
const FEEDBACK_RECIPIENT = process.env.FEEDBACK_RECIPIENT || '';
const feedbackRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => 'feedback:' + requestIp(req),
  message: 'Too many feedback submissions. Please try again later.',
});
const RESEND_FROM = 'PlayChess Feedback <onboarding@resend.dev>';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

router.post('/', feedbackRateLimit, async (req, res) => {
  const { type, message, email } = req.body ?? {};
  const feedbackType = typeof type === 'string' && FEEDBACK_LABELS[type] ? type : 'suggestion';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';

  if (!normalizedMessage) {
    return res.status(400).json({ error: { message: 'Feedback message is required.' } });
  }

  if (normalizedMessage.length > 1000) {
    return res.status(400).json({ error: { message: 'Feedback message is too long.' } });
  }

  if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ error: { message: 'Please provide a valid email address.' } });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = FEEDBACK_RECIPIENT;
  if (!apiKey || !recipient) {
    console.error('[Feedback] Missing RESEND_API_KEY or FEEDBACK_RECIPIENT.');
    return res.status(500).json({ error: { message: 'Feedback email is not configured.' } });
  }

  const label = FEEDBACK_LABELS[feedbackType];
  const from = RESEND_FROM;
  const safeMessage = escapeHtml(normalizedMessage).replace(/\r?\n/g, '<br />');
  const safeEmail = normalizedEmail ? escapeHtml(normalizedEmail) : 'No reply email provided';
  const subject = 'PlayChess feedback: ' + label;
  const text = [
    'Type: ' + label,
    'Message:',
    normalizedMessage,
    normalizedEmail ? 'Reply-to: ' + normalizedEmail : 'No reply email provided',
  ].join('\n');
  const payload = {
    from,
    to: recipient,
    subject,
    text,
    html: '<h2>' + escapeHtml(subject) + '</h2>' +
      '<p><strong>Type:</strong> ' + escapeHtml(label) + '</p>' +
      '<p><strong>Message:</strong><br />' + safeMessage + '</p>' +
      '<p><strong>Reply email:</strong> ' + safeEmail + '</p>',
  };

  if (normalizedEmail) {
    payload.reply_to = normalizedEmail;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Feedback] Resend request failed:', response.status, responseBody);
      return res.status(502).json({ error: { message: 'Unable to send feedback right now.' } });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Feedback] Resend request error:', error?.message || error);
    return res.status(502).json({ error: { message: 'Unable to send feedback right now.' } });
  }
});

export default router;
