const migration = require('../20260723-payment-reconciliation-indexes');
const PaymentAttempt = require('../../../models/PaymentAttempt');
const PaymentWebhookEvent = require('../../../models/PaymentWebhookEvent');

const clone = (value) => JSON.parse(JSON.stringify(value));

const mongoIndexFromPlan = (desired) => ({
  v: 2,
  key: clone(desired.key),
  name: desired.options.name,
  ...(desired.options.unique ? { unique: true } : {}),
  ...(desired.options.sparse ? { sparse: true } : {}),
  ...(desired.options.partialFilterExpression
    ? { partialFilterExpression: clone(desired.options.partialFilterExpression) }
    : {}),
});

const makeCollection = ({ indexes = [], duplicateCalls = {} } = {}) => {
  let storedIndexes = clone(indexes);
  let aggregateCall = 0;

  return {
    indexes: jest.fn(async () => clone(storedIndexes)),
    aggregate: jest.fn(() => {
      const call = aggregateCall;
      aggregateCall += 1;
      return {
        toArray: jest.fn(async () => clone(duplicateCalls[call] || [])),
      };
    }),
    createIndex: jest.fn(async (key, options) => {
      storedIndexes.push(mongoIndexFromPlan({ key, options }));
      return options.name;
    }),
  };
};

const makeMongoose = (collections) => ({
  connection: {
    db: {
      collection: jest.fn((name) => collections[name]),
    },
  },
});

const generatedIndexName = (key) => Object.entries(key)
  .map(([field, direction]) => `${field}_${direction}`)
  .join('_');

const modelIndexContracts = (model) => model.schema.indexes().map(([key, options]) => ({
  key,
  options: {
    name: options.name || generatedIndexName(key),
    ...(options.unique ? { unique: true } : {}),
    ...(options.sparse ? { sparse: true } : {}),
    ...(options.partialFilterExpression
      ? { partialFilterExpression: options.partialFilterExpression }
      : {}),
  },
}));

describe('20260723 payment reconciliation index migration', () => {
  const [attemptPlan, webhookPlan] = migration.INDEX_PLANS;

  test('stays aligned with the immutable model index contracts', () => {
    expect(attemptPlan.collectionName).toBe(PaymentAttempt.collection.collectionName);
    expect(webhookPlan.collectionName).toBe(PaymentWebhookEvent.collection.collectionName);
    expect(attemptPlan.indexes.map(({ key, options }) => ({ key, options })))
      .toEqual(modelIndexContracts(PaymentAttempt));
    expect(webhookPlan.indexes.map(({ key, options }) => ({ key, options })))
      .toEqual(modelIndexContracts(PaymentWebhookEvent));
  });

  test('defines every model uniqueness constraint and supporting query index', () => {
    expect(attemptPlan).toMatchObject({
      collectionName: 'paymentattempts',
      indexes: expect.arrayContaining([
        expect.objectContaining({
          key: { booking: 1 },
          options: expect.objectContaining({
            name: 'one_nonreplaceable_payment_attempt_per_booking',
            unique: true,
            partialFilterExpression: {
              status: {
                $in: [
                  'creating',
                  'order_created',
                  'payment_pending',
                  'payment_failed',
                  'captured',
                  'needs_review',
                ],
              },
            },
          }),
        }),
        expect.objectContaining({
          key: { 'expected.receipt': 1 },
          options: {
            name: 'unique_razorpay_booking_receipt',
            unique: true,
          },
        }),
        expect.objectContaining({
          key: { orderId: 1 },
          options: {
            name: 'unique_razorpay_booking_order',
            unique: true,
            sparse: true,
          },
        }),
        expect.objectContaining({
          key: { paymentId: 1 },
          options: {
            name: 'unique_captured_razorpay_payment',
            unique: true,
            sparse: true,
          },
        }),
        expect.objectContaining({ key: { status: 1 } }),
        expect.objectContaining({ key: { user: 1, createdAt: -1 } }),
        expect.objectContaining({ key: { status: 1, expiresAt: 1 } }),
      ]),
    });
    expect(webhookPlan).toMatchObject({
      collectionName: 'paymentwebhookevents',
      indexes: expect.arrayContaining([
        expect.objectContaining({
          key: { eventKey: 1 },
          options: {
            name: 'unique_payment_webhook_event_key',
            unique: true,
          },
        }),
        expect.objectContaining({
          key: { payloadDigest: 1 },
          options: {
            name: 'unique_payment_webhook_payload_digest',
            unique: true,
          },
        }),
        expect.objectContaining({
          key: { providerEventId: 1 },
          options: {
            name: 'unique_razorpay_webhook_event_id',
            unique: true,
            sparse: true,
          },
        }),
        expect.objectContaining({ key: { processingState: 1 } }),
        expect.objectContaining({ key: { processingState: 1, receivedAt: 1 } }),
        expect.objectContaining({ key: { processingState: 1, nextRetryAt: 1 } }),
        expect.objectContaining({ key: { 'subject.orderId': 1, receivedAt: -1 } }),
      ]),
    });
  });

  test('creates missing indexes and verifies their exact specifications', async () => {
    const collections = {
      paymentattempts: makeCollection(),
      paymentwebhookevents: makeCollection(),
    };

    await migration.up({ mongoose: makeMongoose(collections) });

    expect(collections.paymentattempts.createIndex).toHaveBeenCalledTimes(
      attemptPlan.indexes.length
    );
    expect(collections.paymentwebhookevents.createIndex).toHaveBeenCalledTimes(
      webhookPlan.indexes.length
    );
    for (const plan of [attemptPlan, webhookPlan]) {
      const collection = collections[plan.collectionName];
      plan.indexes.forEach(({ key, options }) => {
        expect(collection.createIndex).toHaveBeenCalledWith(key, options);
      });
      expect(collection.indexes).toHaveBeenCalledTimes(2);
    }
  });

  test('is idempotent when every exact index already exists', async () => {
    const collections = Object.fromEntries(migration.INDEX_PLANS.map((plan) => [
      plan.collectionName,
      makeCollection({ indexes: plan.indexes.map(mongoIndexFromPlan) }),
    ]));

    await migration.up({ mongoose: makeMongoose(collections) });

    Object.values(collections).forEach((collection) => {
      expect(collection.createIndex).not.toHaveBeenCalled();
      expect(collection.indexes).toHaveBeenCalledTimes(2);
    });
  });

  test.each([
    ['a conflicting key', {
      v: 2,
      key: { booking: -1 },
      name: 'one_nonreplaceable_payment_attempt_per_booking',
      unique: true,
      partialFilterExpression: {
        status: { $in: migration.NON_REPLACEABLE_ATTEMPT_STATUSES },
      },
    }],
    ['missing uniqueness', {
      v: 2,
      key: { booking: 1 },
      name: 'one_nonreplaceable_payment_attempt_per_booking',
      partialFilterExpression: {
        status: { $in: migration.NON_REPLACEABLE_ATTEMPT_STATUSES },
      },
    }],
    ['an incompatible partial filter', {
      v: 2,
      key: { booking: 1 },
      name: 'one_nonreplaceable_payment_attempt_per_booking',
      unique: true,
      partialFilterExpression: { status: { $in: ['creating'] } },
    }],
  ])('fails closed when a desired index name has %s', async (_label, conflictingIndex) => {
    const attempts = makeCollection({ indexes: [conflictingIndex] });
    const webhooks = makeCollection();

    await expect(migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: webhooks,
      }),
    })).rejects.toThrow(/exists with an incompatible key or options/);

    expect(attempts.createIndex).not.toHaveBeenCalled();
    expect(webhooks.createIndex).not.toHaveBeenCalled();
    expect(attempts.dropIndex).toBeUndefined();
  });

  test('reports an equivalent key under another name instead of dropping it', async () => {
    const attempts = makeCollection({
      indexes: [{
        v: 2,
        key: { booking: 1 },
        name: 'legacy_active_attempt_index',
        unique: true,
        partialFilterExpression: {
          status: { $in: migration.NON_REPLACEABLE_ATTEMPT_STATUSES },
        },
      }],
    });

    await expect(migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: makeCollection(),
      }),
    })).rejects.toThrow(/already exists as "legacy_active_attempt_index"/);

    expect(attempts.createIndex).not.toHaveBeenCalled();
    expect(attempts.dropIndex).toBeUndefined();
  });

  test.each([
    [0, 'non-replaceable payment attempts'],
    [1, 'payment-attempt receipts'],
    [2, 'stored Razorpay order IDs'],
    [3, 'stored Razorpay payment IDs'],
  ])('detects payment-attempt duplicate domain %i before creating indexes', async (
    duplicateCall,
    expectedMessage
  ) => {
    const attempts = makeCollection({
      duplicateCalls: { [duplicateCall]: [{ _id: 'redacted', count: 2 }] },
    });
    const webhooks = makeCollection();

    await expect(migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: webhooks,
      }),
    })).rejects.toThrow(expectedMessage);

    expect(attempts.createIndex).not.toHaveBeenCalled();
    expect(webhooks.createIndex).not.toHaveBeenCalled();
  });

  test.each([
    [0, 'webhook event keys'],
    [1, 'webhook payload digests'],
    [2, 'stored Razorpay webhook event IDs'],
  ])('detects webhook duplicate domain %i before creating any indexes', async (
    duplicateCall,
    expectedMessage
  ) => {
    const attempts = makeCollection();
    const webhooks = makeCollection({
      duplicateCalls: { [duplicateCall]: [{ _id: 'redacted', count: 2 }] },
    });

    await expect(migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: webhooks,
      }),
    })).rejects.toThrow(expectedMessage);

    expect(attempts.createIndex).not.toHaveBeenCalled();
    expect(webhooks.createIndex).not.toHaveBeenCalled();
  });

  test('uses exact sparse and partial duplicate domains without exposing duplicate values', () => {
    const active = attemptPlan.indexes.find(({ options }) => (
      options.name === 'one_nonreplaceable_payment_attempt_per_booking'
    ));
    const order = attemptPlan.indexes.find(({ options }) => (
      options.name === 'unique_razorpay_booking_order'
    ));

    expect(migration.buildDuplicatePipeline(active.duplicateCheck)).toEqual([
      {
        $match: {
          status: { $in: migration.NON_REPLACEABLE_ATTEMPT_STATUSES },
        },
      },
      { $group: { _id: '$booking', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
    expect(migration.buildDuplicatePipeline(order.duplicateCheck)).toEqual([
      { $match: { orderId: { $exists: true } } },
      { $group: { _id: '$orderId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
  });

  test('does not turn a MongoDB build failure into a destructive repair', async () => {
    const attempts = makeCollection();
    attempts.createIndex.mockRejectedValueOnce(Object.assign(
      new Error('duplicate key details must not be echoed'),
      { code: 11000, codeName: 'DuplicateKey' }
    ));

    await expect(migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: makeCollection(),
      }),
    })).rejects.toThrow(
      /MongoDB could not create "status_1".*code DuplicateKey.*No records or existing indexes were deleted/
    );
    expect(attempts.dropIndex).toBeUndefined();
  });

  test('treats a not-yet-created collection as having no indexes', async () => {
    const attempts = makeCollection();
    attempts.indexes.mockRejectedValueOnce(Object.assign(
      new Error('namespace does not exist'),
      { code: 26, codeName: 'NamespaceNotFound' }
    ));
    const webhooks = makeCollection();

    await migration.up({
      mongoose: makeMongoose({
        paymentattempts: attempts,
        paymentwebhookevents: webhooks,
      }),
    });

    expect(attempts.createIndex).toHaveBeenCalledTimes(attemptPlan.indexes.length);
  });
});
