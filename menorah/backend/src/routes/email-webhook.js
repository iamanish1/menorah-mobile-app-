const express = require('express');
const { getRedisClient } = require('../config/redis');
const {
  getResendDeliveryOutcome,
  getResendReplayKey,
  verifyResendWebhook,
} = require('../services/resendWebhook');
const { recordEmailDelivery } = require('../utils/reliabilityMetrics');

const router = express.Router();
const REPLAY_TTL_SECONDS = 24 * 60 * 60;

router.post('/resend', async (req, res) => {
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Webhook unavailable' });
  }

  let verified;
  try {
    verified = verifyResendWebhook({
      rawBody: req.body,
      id: req.headers['svix-id'],
      timestamp: req.headers['svix-timestamp'],
      signature: req.headers['svix-signature'],
      secret,
    });
  } catch (_error) {
    return res.status(400).json({ success: false, message: 'Invalid webhook' });
  }

  try {
    const claimed = await getRedisClient().set(
      getResendReplayKey(verified.id),
      '1',
      { NX: true, EX: REPLAY_TTL_SECONDS }
    );
    if (claimed !== 'OK') {
      return res.json({ success: true, duplicate: true });
    }
  } catch (_error) {
    return res.status(503).json({ success: false, message: 'Webhook temporarily unavailable' });
  }

  const outcome = getResendDeliveryOutcome(verified.event.type);
  if (outcome) {
    recordEmailDelivery({ provider: 'resend', outcome });
  }
  return res.json({ success: true, ignored: !outcome || undefined });
});

module.exports = router;
