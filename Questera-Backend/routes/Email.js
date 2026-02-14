const express = require('express');
const emailRouter = express.Router();
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * POST /api/email/send
 * Simple email endpoint - user decides everything
 *
 * Body:
 * - to: string | array (required) - recipient email(s)
 * - subject: string (required) - email subject
 * - body: string (required) - HTML body content
 */
emailRouter.post('/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    // Validate required fields
    if (!to) {
      return res.status(400).json({ success: false, error: 'to is required' });
    }
    if (!subject) {
      return res.status(400).json({ success: false, error: 'subject is required' });
    }
    if (!body) {
      return res.status(400).json({ success: false, error: 'body is required' });
    }

    // Handle single or multiple recipients
    const recipients = Array.isArray(to) ? to : [to];

    const results = [];
    const errors = [];

    for (const email of recipients) {
      try {
        const command = new SendEmailCommand({
          Source: process.env.SES_SENDER_EMAIL,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: subject },
            Body: { Html: { Data: body } },
          },
        });

        await ses.send(command);
        console.log(`[EMAIL] Sent to ${email}: ${subject}`);
        results.push({ email, success: true });
      } catch (err) {
        console.error(`[EMAIL] Failed to send to ${email}:`, err.message);
        errors.push({ email, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      sent: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('[EMAIL] Send error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = emailRouter;

