/**
 * Razorpay X Payout Webhook — no JWT auth (called by Razorpay servers)
 * Register in server.js BEFORE app.use('/api/admin', adminRoutes)
 * Route: POST /api/payouts/webhook
 */

const express = require('express');
const Payout  = require('../models/Payout');
const Counsellor = require('../models/Counsellor');
const { getPermittedPriorPayoutStatuses } = require('../services/payoutPolicy');
const {
  getRazorpayPayoutConfigurationState,
} = require('../config/paymentFeatures');
const {
  verifyRazorpayWebhookSignature,
} = require('../services/razorpayPaymentSecurity');
const {
  SUPPORTED_PAYOUT_EVENT_STATUSES,
  claimPayoutWebhookEvent,
  finalizePayoutWebhookEvent,
  recordPayoutWebhookIdentityConflict,
  validatePayoutWebhookEntity,
} = require('../services/payoutWebhookReconciliation');
const { recordSecurityEvent } = require('../utils/securityAudit');
const { recordPaymentWebhook } = require('../utils/reliabilityMetrics');

const router = express.Router();

async function sendPayoutSms() {
  return false;
}

const reconcileCounsellorSettlement = async (counsellorId) => {
  const [settlement] = await Payout.aggregate([
    { $match: { counsellor: counsellorId, status: 'processed' } },
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
  await Counsellor.findByIdAndUpdate(counsellorId, {
    $set: {
      totalPaidOut: settlement?.totalPaidOut || 0,
      lastPayoutAt: settlement?.lastPayoutAt || null,
      lastPayoutAmount: settlement?.lastPayoutAmount || 0,
    },
  });
};

// POST /api/payouts/webhook
router.post('/', async (req, res) => {
  let claim = null;
  try {
    const webhookSecret = process.env.RAZORPAY_X_WEBHOOK_SECRET;
    const configuration = getRazorpayPayoutConfigurationState();

    // Signature verification is ALWAYS required — no bypass, no dev skip.
    // An unverified payout webhook lets attackers inject fake payout completions.
    if (!configuration.webhookConfigured) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'failure' });
      console.error('Payout webhook: RAZORPAY_X_WEBHOOK_SECRET not configured — rejecting request');
      return res.status(503).json({ success: false, message: 'Webhook not configured' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'failure' });
      return res.status(400).json({ success: false, message: 'Raw request body required' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'signature', outcome: 'failure' });
      console.warn('Payout webhook: missing x-razorpay-signature header');
      return res.status(400).json({ success: false, message: 'Missing signature' });
    }

    if (!verifyRazorpayWebhookSignature({
      rawBody: req.body,
      signature,
      secret: webhookSecret,
    })) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'signature', outcome: 'failure' });
      console.warn('Payout webhook: invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    recordPaymentWebhook({ provider: 'razorpay', event: 'signature', outcome: 'success' });

    const rawBody = req.body;
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'failure' });
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }
    const payoutData = event?.payload?.payout?.entity;
    claim = await claimPayoutWebhookEvent({
      rawBody,
      providerEventId: req.get('x-razorpay-event-id'),
      eventType: event?.event,
      providerPayoutId: payoutData?.id,
    });

    if (claim.conflict) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      await recordPayoutWebhookIdentityConflict({ eventId: claim.event._id });
      recordSecurityEvent('payout_webhook_identity_conflict', {
        req,
        outcome: 'failure',
        statusCode: 200,
        details: {
          provider: 'razorpay_x',
          reason: 'identity_conflict',
          resource: 'payout_webhook',
        },
      });
      return res.status(200).json({ success: true, reviewRequired: true });
    }
    if (!claim.claimed) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'replay' });
      return res.status(200).json({ success: true, duplicate: true });
    }

    const finalizeClaim = (options) => finalizePayoutWebhookEvent({
      eventId: claim.event._id,
      payloadDigest: claim.identity.payloadDigest,
      providerPayoutId: payoutData?.id,
      ...options,
    });

    if (!payoutData?.id) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      await finalizeClaim({
        processingState: 'needs_review',
        reconciliationDecision: 'needs_review',
        mismatchCodes: ['PAYOUT_ENTITY_MISSING'],
      });
      return res.status(200).json({ success: true, reviewRequired: true });
    }

    const TERMINAL_STATUSES = ['processed', 'reversed', 'cancelled', 'failed', 'rejected'];
    const newStatus = payoutData.status;
    if (!Object.prototype.hasOwnProperty.call(
      SUPPORTED_PAYOUT_EVENT_STATUSES,
      event?.event
    )) {
      await finalizeClaim({
        processingState: 'ignored',
        reconciliationDecision: 'ignore',
        mismatchCodes: ['UNSUPPORTED_EVENT_TYPE'],
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    const permittedPriorStatuses = getPermittedPriorPayoutStatuses(newStatus);
    if (!permittedPriorStatuses) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      await finalizeClaim({
        processingState: 'needs_review',
        reconciliationDecision: 'needs_review',
        mismatchCodes: ['PAYOUT_STATUS_UNSUPPORTED'],
      });
      return res.status(200).json({ success: true, reviewRequired: true });
    }

    const storedPayout = await Payout.findOne({
      razorpayPayoutId: payoutData.id,
    }).populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName phone' },
    });
    if (!storedPayout) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      await finalizeClaim({
        processingState: 'needs_review',
        reconciliationDecision: 'needs_review',
        mismatchCodes: ['PAYOUT_RECORD_NOT_FOUND'],
      });
      recordSecurityEvent('payout_webhook_reconciliation_mismatch', {
        req,
        outcome: 'failure',
        statusCode: 200,
        details: {
          provider: 'razorpay_x',
          reason: 'payout_record_not_found',
          resource: 'payout_webhook',
        },
      });
      return res.status(200).json({ success: true, reviewRequired: true });
    }

    const validation = validatePayoutWebhookEntity({
      event,
      payoutData,
      payoutRecord: storedPayout,
    });
    const webhookEventId = claim.identity.providerEventId
      || claim.identity.payloadDigest;
    if (!validation.valid) {
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      await Payout.updateOne({
        _id: storedPayout._id,
        razorpayPayoutId: payoutData.id,
      }, {
        $set: {
          reconciliationStatus: 'needs_review',
          reconciliationMismatchCodes: validation.mismatchCodes,
          lastWebhookAt: new Date(),
          webhookEventId,
          lastWebhookPayloadDigest: claim.identity.payloadDigest,
        },
      });
      await finalizeClaim({
        processingState: 'needs_review',
        reconciliationDecision: 'needs_review',
        mismatchCodes: validation.mismatchCodes,
        payoutId: storedPayout._id,
      });
      recordSecurityEvent('payout_webhook_reconciliation_mismatch', {
        req,
        outcome: 'failure',
        statusCode: 200,
        details: {
          provider: 'razorpay_x',
          reason: 'entity_mismatch',
          resource: 'payout_webhook',
          targetId: storedPayout._id,
        },
      });
      return res.status(200).json({ success: true, reviewRequired: true });
    }

    const webhookMatch = {
      _id: storedPayout._id,
      razorpayPayoutId: payoutData.id,
      amountPaise: payoutData.amount,
      referenceId: payoutData.reference_id,
      razorpayFundAccountId: payoutData.fund_account_id,
      counsellor: storedPayout.counsellor._id,
      status: { $in: permittedPriorStatuses },
    };
    const payoutRecord = await Payout.findOneAndUpdate(
      webhookMatch,
      {
        $set: {
          status: newStatus,
          utr: payoutData.utr || null,
          failureReason: payoutData.failure_reason || null,
          lastWebhookAt: new Date(),
          webhookEventId,
          lastWebhookPayloadDigest: claim.identity.payloadDigest,
          reconciliationStatus: 'matched',
          reconciliationMismatchCodes: [],
        },
      },
      { new: true }
    ).populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName phone' }
    });

    if (!payoutRecord) {
      const current = await Payout.findById(storedPayout._id).lean();
      const alreadyApplied = current?.status === newStatus
        && current?.lastWebhookPayloadDigest === claim.identity.payloadDigest;
      if (alreadyApplied) {
        recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'replay' });
        // A previous delivery may have committed the payout transition and
        // crashed before updating derived counters or the event ledger.
        await reconcileCounsellorSettlement(storedPayout.counsellor._id);
        await finalizeClaim({
          processingState: 'processed',
          reconciliationDecision: 'already_applied',
          payoutId: storedPayout._id,
        });
        return res.status(200).json({ success: true, duplicate: true });
      }

      const terminalStateWins = TERMINAL_STATUSES.includes(current?.status)
        && !(
          current.status === 'processed'
          && newStatus === 'reversed'
        );
      if (terminalStateWins) {
        await finalizeClaim({
          processingState: 'ignored',
          reconciliationDecision: 'ignore',
          mismatchCodes: ['OUT_OF_ORDER_PAYOUT_STATUS'],
          payoutId: storedPayout._id,
        });
        return res.status(200).json({ success: true, ignored: true });
      }

      await Payout.updateOne({ _id: storedPayout._id }, {
        $set: {
          reconciliationStatus: 'needs_review',
          reconciliationMismatchCodes: ['PAYOUT_STATUS_TRANSITION_CONFLICT'],
        },
      });
      await finalizeClaim({
        processingState: 'needs_review',
        reconciliationDecision: 'needs_review',
        mismatchCodes: ['PAYOUT_STATUS_TRANSITION_CONFLICT'],
        payoutId: storedPayout._id,
      });
      recordPaymentWebhook({ provider: 'razorpay', event: 'relationship', outcome: 'failure' });
      return res.status(200).json({ success: true, reviewRequired: true });
    }

    // Keep the denormalized display counters consistent with the immutable
    // payout ledger. Recalculation makes retries and status corrections safe.
    await reconcileCounsellorSettlement(payoutRecord.counsellor._id);

    // Send SMS on terminal status
    if (TERMINAL_STATUSES.includes(newStatus) && payoutRecord.counsellor?.user) {
      const { phone, firstName } = payoutRecord.counsellor.user;
      const smsStatus = newStatus === 'processed' ? 'processed' : 'failed';
      await sendPayoutSms(phone, firstName, payoutRecord.amountRupees, payoutData.id, smsStatus);
    }

    await finalizeClaim({
      processingState: 'processed',
      reconciliationDecision: 'apply',
      payoutId: payoutRecord._id,
    });
    recordPaymentWebhook({ provider: 'razorpay', event: 'reconciliation', outcome: 'success' });
    console.log(`Payout webhook processed with status: ${newStatus}`);
    res.status(200).json({ success: true });

  } catch (error) {
    recordPaymentWebhook({ provider: 'razorpay', event: 'processing', outcome: 'failure' });
    if (claim?.event?._id && claim?.identity?.payloadDigest && !claim.conflict) {
      try {
        await finalizePayoutWebhookEvent({
          eventId: claim.event._id,
          payloadDigest: claim.identity.payloadDigest,
          processingState: 'retryable_failure',
          reconciliationDecision: 'needs_review',
          failureCode: 'PAYOUT_WEBHOOK_PROCESSING_FAILED',
        });
      } catch {
        console.error('Payout webhook failure ledger update failed');
      }
    }
    console.error('Payout webhook error:', error.message);
    res.status(503).json({ success: false, message: 'Webhook temporarily unavailable' });
  }
});

module.exports = router;
