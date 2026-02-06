import express from 'express';
import { errorResponse, handleRouteError } from '../middleware/errors.js';

const router = express.Router();

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TO_EMAIL = 'mokmarcus068@gmail.com';
const MAX_MESSAGE_LENGTH = 1000;

const isValidEmail = (value) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

router.post('/', async (req, res) => {
  try {
    const { feedbackType, message, email } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return errorResponse(res, 400, 'Feedback message is required');
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return errorResponse(res, 400, 'Feedback message is too long');
    }

    const normalizedType = typeof feedbackType === 'string' && feedbackType.trim()
      ? feedbackType.trim().toLowerCase()
      : 'general';

    if (email && !isValidEmail(email)) {
      return errorResponse(res, 400, 'Invalid email address');
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const toEmail = process.env.FEEDBACK_TO_EMAIL || DEFAULT_TO_EMAIL;

    if (!resendApiKey) {
      return errorResponse(res, 503, 'Email service not configured');
    }

    const textLines = [
      `Type: ${normalizedType}`,
      email ? `From: ${email}` : 'From: (not provided)',
      '',
      message.trim(),
    ];

    const payload = {
      from: fromEmail,
      to: [toEmail],
      subject: `Chess Feedback: ${normalizedType}`,
      text: textLines.join('\n'),
    };

    if (email) {
      payload.reply_to = email;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[Feedback] Resend error:', response.status, errorBody);
      return errorResponse(res, 502, 'Failed to send feedback email');
    }

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to submit feedback');
  }
});

export default router;
