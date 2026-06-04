/**
 * Razorpay X Payout Webhook — no JWT auth (called by Razorpay servers)
 * Register in server.js BEFORE app.use('/api/admin', adminRoutes)
 * Route: POST /api/payouts/webhook
 */

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');
const Payout  = require('../models/Payout');

const router = express.Router();

// ── SMS helper (same as admin.js) ──────────────────────────────────────────
async function sendPayoutSms(phone, firstName, amountRupees, payoutId, status) {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key || !phone) return;
  try {
    const message = status === 'processed'
      ? `Dear ${firstName}, your payout of Rs.${amountRupees} has been credited to your bank account. Payout ID: ${payoutId}. Thank you - Menorah Health.`
      : `Dear ${firstName}, your payout of Rs.${amountRupees} could not be processed. Payout ID: ${payoutId}. Please contact support@menorah.me - Menorah Health.`;

    await axios.post('https://api.msg91.com/api/sendhttp.php', null, {
      params: {
        authkey: key,
        mobiles: phone.replace(/^\+/, ''),
        message,
        sender: 'MENRH',
        route: 4
      }
    });
  } catch (err) {
    console.error('Payout SMS error:', err.message);
  }
}

// POST /api/payouts/webhook
router.post('/', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_X_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify signature in production
    if (
      webhookSecret &&
      !webhookSecret.startsWith('REPLACE_') &&
      process.env.NODE_ENV === 'production'
    ) {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody   = req.body.toString('utf8');
      const expected  = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        console.warn('Payout webhook: invalid signature');
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event      = JSON.parse(req.body.toString('utf8'));
    const payoutData = event?.payload?.payout?.entity;

    // Acknowledge immediately for events we don't process
    if (!payoutData?.id) {
      console.log(`Payout webhook: unhandled event ${event?.event}`);
      return res.status(200).json({ success: true });
    }

    const TERMINAL_STATUSES = ['processed', 'reversed', 'cancelled', 'failed'];
    const newStatus = payoutData.status;

    const payoutRecord = await Payout.findOneAndUpdate(
      { razorpayPayoutId: payoutData.id },
      {
        status:         newStatus,
        utr:            payoutData.utr || null,
        failureReason:  payoutData.failure_reason || null,
        lastWebhookAt:  new Date(),
        webhookEventId: event.id || null,
      },
      { new: true }
    ).populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName phone' }
    });

    if (!payoutRecord) {
      console.warn(`Payout webhook: no record for razorpayPayoutId=${payoutData.id}`);
      return res.status(200).json({ success: true }); // still acknowledge
    }

    // Send SMS on terminal status
    if (TERMINAL_STATUSES.includes(newStatus) && payoutRecord.counsellor?.user) {
      const { phone, firstName } = payoutRecord.counsellor.user;
      const smsStatus = newStatus === 'processed' ? 'processed' : 'failed';
      await sendPayoutSms(phone, firstName, payoutRecord.amountRupees, payoutData.id, smsStatus);
    }

    console.log(`Payout webhook processed: ${payoutData.id} → ${newStatus}${payoutData.utr ? ` (UTR: ${payoutData.utr})` : ''}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Payout webhook error:', error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
