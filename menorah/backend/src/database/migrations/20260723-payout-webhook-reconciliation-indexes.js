const {
  preflightCollection,
  createMissingIndexes,
  verifyCollection,
} = require('./20260723-payment-reconciliation-indexes');

const INDEX_PLANS = Object.freeze([
  {
    collectionName: 'payouts',
    indexes: [
      {
        key: { reconciliationStatus: 1 },
        options: { name: 'reconciliationStatus_1' },
      },
      {
        key: { reconciliationStatus: 1, updatedAt: -1 },
        options: { name: 'reconciliationStatus_1_updatedAt_-1' },
      },
    ],
  },
  {
    collectionName: 'payoutwebhookevents',
    indexes: [
      {
        key: { providerPayoutId: 1 },
        options: { name: 'providerPayoutId_1' },
      },
      {
        key: { payout: 1 },
        options: { name: 'payout_1' },
      },
      {
        key: { processingState: 1 },
        options: { name: 'processingState_1' },
      },
      {
        key: { eventKey: 1 },
        options: {
          name: 'unique_payout_webhook_event_key',
          unique: true,
        },
        duplicateCheck: {
          groupBy: '$eventKey',
          description: 'payout webhook event keys',
        },
      },
      {
        key: { payloadDigest: 1 },
        options: {
          name: 'unique_payout_webhook_payload_digest',
          unique: true,
        },
        duplicateCheck: {
          groupBy: '$payloadDigest',
          description: 'payout webhook payload digests',
        },
      },
      {
        key: { providerEventId: 1 },
        options: {
          name: 'unique_razorpay_x_webhook_event_id',
          unique: true,
          sparse: true,
        },
        duplicateCheck: {
          match: { providerEventId: { $exists: true } },
          groupBy: '$providerEventId',
          description: 'RazorpayX payout webhook event IDs',
        },
      },
      {
        key: { processingState: 1, receivedAt: 1 },
        options: { name: 'processingState_1_receivedAt_1' },
      },
      {
        key: { providerPayoutId: 1, receivedAt: -1 },
        options: { name: 'providerPayoutId_1_receivedAt_-1' },
      },
    ],
  },
]);

module.exports = {
  INDEX_PLANS,
  async up({ mongoose }) {
    const contexts = INDEX_PLANS.map((plan) => ({
      plan,
      collection: mongoose.connection.db.collection(plan.collectionName),
    }));

    const existingByCollection = [];
    for (const context of contexts) {
      existingByCollection.push(
        await preflightCollection(context.collection, context.plan)
      );
    }

    for (let index = 0; index < contexts.length; index += 1) {
      await createMissingIndexes(
        contexts[index].collection,
        contexts[index].plan,
        existingByCollection[index]
      );
    }

    for (const context of contexts) {
      await verifyCollection(context.collection, context.plan);
    }
  },
};
