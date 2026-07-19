/**
 * Razorpay X Payout Webhook — no JWT auth (called by Razorpay servers)
 * Register in server.js BEFORE app.use('/api/admin', adminRoutes)
 * Route: POST /api/payouts/webhook
 */

const express = require('express');
const crypto  = require('crypto');
const Payout  = require('../models/Payout');
const Counsellor = require('../models/Counsellor');
const { getPermittedPriorPayoutStatuses } = require('../services/payoutPolicy');

const router = express.Router();

async function sendPayoutSms() {
  return false;
}

// POST /api/payouts/webhook
router.post('/', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_X_WEBHOOK_SECRET;

    // Signature verification is ALWAYS required — no bypass, no dev skip.
    // An unverified payout webhook lets attackers inject fake payout completions.
    if (!webhookSecret || webhookSecret.startsWith('REPLACE_')) {
      console.error('Payout webhook: RAZORPAY_X_WEBHOOK_SECRET not configured — rejecting request');
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      console.warn('Payout webhook: missing x-razorpay-signature header');
      return res.status(400).json({ success: false, message: 'Missing signature' });
    }

    const rawBody  = req.body.toString('utf8');
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    // Timing-safe comparison — prevents brute-force via timing side-channel
    const signaturesMatch = (() => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(expected,  'hex')
        );
      } catch { return false; }
    })();

    if (!signaturesMatch) {
      console.warn('Payout webhook: invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event      = JSON.parse(req.body.toString('utf8'));
    const payoutData = event?.payload?.payout?.entity;

    // Acknowledge immediately for events we don't process
    if (!payoutData?.id) {
      console.log('Payout webhook ignored an event without a payout entity.');
      return res.status(200).json({ success: true });
    }

    const TERMINAL_STATUSES = ['processed', 'reversed', 'cancelled', 'failed', 'rejected'];
    const newStatus = payoutData.status;
    const permittedPriorStatuses = getPermittedPriorPayoutStatuses(newStatus);
    if (!permittedPriorStatuses) {
      console.warn('Payout webhook ignored an unsupported provider status.');
      return res.status(200).json({ success: true });
    }

    // Razorpay normally supplies an event ID. Hashing the signed raw body gives
    // retries without one the same idempotency protection without storing it.
    const webhookEventId = event.id || crypto.createHash('sha256').update(rawBody).digest('hex');
    const webhookMatch = {
      razorpayPayoutId: payoutData.id,
      webhookEventId: { $ne: webhookEventId },
      status: { $in: permittedPriorStatuses },
    };
    const payoutRecord = await Payout.findOneAndUpdate(
      webhookMatch,
      {
        status:         newStatus,
        utr:            payoutData.utr || null,
        failureReason:  payoutData.failure_reason || null,
        lastWebhookAt:  new Date(),
        webhookEventId,
      },
      { new: true }
    ).populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName phone' }
    });

    if (!payoutRecord) {
      // Duplicate delivery is expected from payment providers. It is safe to
      // acknowledge it without repeating customer notifications or accounting.
      return res.status(200).json({ success: true });
    }

    // Keep the denormalized display counters consistent with the immutable
    // payout ledger. Recalculation makes retries and status corrections safe.
    const [settlement] = await Payout.aggregate([
      { $match: { counsellor: payoutRecord.counsellor._id, status: 'processed' } },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: null,
          totalPaidOut: { $sum: '$amountRupees' },
          lastPayoutAt: { $first: '$updatedAt' },
          lastPayoutAmount: { $first: '$amountRupees' },
        },
      },
    ]);
    const counsellorUpdate = {
      totalPaidOut: settlement?.totalPaidOut || 0,
      lastPayoutAt: settlement?.lastPayoutAt || null,
      lastPayoutAmount: settlement?.lastPayoutAmount || 0,
    };
    await Counsellor.findByIdAndUpdate(payoutRecord.counsellor._id, {
      $set: counsellorUpdate,
    });

    // Send SMS on terminal status
    if (TERMINAL_STATUSES.includes(newStatus) && payoutRecord.counsellor?.user) {
      const { phone, firstName } = payoutRecord.counsellor.user;
      const smsStatus = newStatus === 'processed' ? 'processed' : 'failed';
      await sendPayoutSms(phone, firstName, payoutRecord.amountRupees, payoutData.id, smsStatus);
    }

    console.log(`Payout webhook processed with status: ${newStatus}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Payout webhook error:', error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
