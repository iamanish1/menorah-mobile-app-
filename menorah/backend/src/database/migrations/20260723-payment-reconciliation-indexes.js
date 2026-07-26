const PAYMENT_ATTEMPT_COLLECTION = 'paymentattempts';
const PAYMENT_WEBHOOK_EVENT_COLLECTION = 'paymentwebhookevents';

const NON_REPLACEABLE_ATTEMPT_STATUSES = Object.freeze([
  'creating',
  'order_created',
  'payment_pending',
  'payment_failed',
  'captured',
  'needs_review',
]);

const INDEX_PLANS = Object.freeze([
  {
    collectionName: PAYMENT_ATTEMPT_COLLECTION,
    indexes: [
      {
        key: { status: 1 },
        options: { name: 'status_1' },
      },
      {
        key: { booking: 1 },
        options: {
          name: 'one_nonreplaceable_payment_attempt_per_booking',
          unique: true,
          partialFilterExpression: {
            status: { $in: [...NON_REPLACEABLE_ATTEMPT_STATUSES] },
          },
        },
        duplicateCheck: {
          match: {
            status: { $in: [...NON_REPLACEABLE_ATTEMPT_STATUSES] },
          },
          groupBy: '$booking',
          description: 'non-replaceable payment attempts for a booking',
        },
      },
      {
        key: { 'expected.receipt': 1 },
        options: {
          name: 'unique_razorpay_booking_receipt',
          unique: true,
        },
        duplicateCheck: {
          groupBy: '$expected.receipt',
          description: 'payment-attempt receipts (including missing or null receipt collisions)',
        },
      },
      {
        key: { orderId: 1 },
        options: {
          name: 'unique_razorpay_booking_order',
          unique: true,
          sparse: true,
        },
        duplicateCheck: {
          match: { orderId: { $exists: true } },
          groupBy: '$orderId',
          description: 'stored Razorpay order IDs',
        },
      },
      {
        key: { paymentId: 1 },
        options: {
          name: 'unique_captured_razorpay_payment',
          unique: true,
          sparse: true,
        },
        duplicateCheck: {
          match: { paymentId: { $exists: true } },
          groupBy: '$paymentId',
          description: 'stored Razorpay payment IDs',
        },
      },
      {
        key: { user: 1, createdAt: -1 },
        options: { name: 'user_1_createdAt_-1' },
      },
      {
        key: { status: 1, expiresAt: 1 },
        options: { name: 'status_1_expiresAt_1' },
      },
    ],
  },
  {
    collectionName: PAYMENT_WEBHOOK_EVENT_COLLECTION,
    indexes: [
      {
        key: { processingState: 1 },
        options: { name: 'processingState_1' },
      },
      {
        key: { eventKey: 1 },
        options: {
          name: 'unique_payment_webhook_event_key',
          unique: true,
        },
        duplicateCheck: {
          groupBy: '$eventKey',
          description: 'webhook event keys (including missing or null event-key collisions)',
        },
      },
      {
        key: { payloadDigest: 1 },
        options: {
          name: 'unique_payment_webhook_payload_digest',
          unique: true,
        },
        duplicateCheck: {
          groupBy: '$payloadDigest',
          description: 'webhook payload digests (including missing or null digest collisions)',
        },
      },
      {
        key: { providerEventId: 1 },
        options: {
          name: 'unique_razorpay_webhook_event_id',
          unique: true,
          sparse: true,
        },
        duplicateCheck: {
          match: { providerEventId: { $exists: true } },
          groupBy: '$providerEventId',
          description: 'stored Razorpay webhook event IDs',
        },
      },
      {
        key: { processingState: 1, receivedAt: 1 },
        options: { name: 'processingState_1_receivedAt_1' },
      },
      {
        key: { processingState: 1, nextRetryAt: 1 },
        options: { name: 'processingState_1_nextRetryAt_1' },
      },
      {
        key: { 'subject.orderId': 1, receivedAt: -1 },
        options: { name: 'subject.orderId_1_receivedAt_-1' },
      },
    ],
  },
]);

const preflightError = (message) => new Error(
  `[payment-index-preflight] ${message} `
  + 'No records or existing indexes were deleted; remediate under an approved operator plan and rerun.'
);

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
};

const sameDocument = (left, right) => (
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
);

const sameIndexKey = (left, right) => {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});

  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => (
      field === rightEntries[index]?.[0] && direction === rightEntries[index]?.[1]
    ));
};

const indexMatchesPlan = (existing, desired) => (
  sameIndexKey(existing.key, desired.key)
  && Boolean(existing.unique) === Boolean(desired.options.unique)
  && Boolean(existing.sparse) === Boolean(desired.options.sparse)
  && sameDocument(
    existing.partialFilterExpression || null,
    desired.options.partialFilterExpression || null
  )
  && existing.collation === undefined
  && existing.expireAfterSeconds === undefined
  && existing.hidden !== true
);

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
      return [];
    }
    throw error;
  }
};

const buildDuplicatePipeline = ({ match, groupBy }) => {
  const pipeline = [];
  if (match) {
    pipeline.push({ $match: match });
  }
  pipeline.push(
    { $group: { _id: groupBy, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 }
  );
  return pipeline;
};

const assertNoDuplicates = async (collection, collectionName, desired) => {
  if (!desired.duplicateCheck) {
    return;
  }

  const duplicates = await collection.aggregate(
    buildDuplicatePipeline(desired.duplicateCheck),
    { allowDiskUse: false }
  ).toArray();

  if (duplicates.length) {
    throw preflightError(
      `Cannot create "${desired.options.name}" on "${collectionName}": `
      + `duplicate ${desired.duplicateCheck.description} exist.`
    );
  }
};

const assertCompatibleIndexState = (existingIndexes, collectionName, desired) => {
  const sameName = existingIndexes.find(({ name }) => name === desired.options.name);
  if (sameName) {
    if (!indexMatchesPlan(sameName, desired)) {
      throw preflightError(
        `Index "${desired.options.name}" on "${collectionName}" exists with an incompatible `
        + 'key or options.'
      );
    }
    return true;
  }

  const sameKey = existingIndexes.find((existing) => sameIndexKey(existing.key, desired.key));
  if (sameKey) {
    throw preflightError(
      `Index key for "${desired.options.name}" on "${collectionName}" already exists as `
      + `"${sameKey.name}" with a different name or options.`
    );
  }

  return false;
};

const preflightCollection = async (collection, plan) => {
  const existingIndexes = await listIndexes(collection);

  for (const desired of plan.indexes) {
    assertCompatibleIndexState(existingIndexes, plan.collectionName, desired);
    await assertNoDuplicates(collection, plan.collectionName, desired);
  }

  return existingIndexes;
};

const createMissingIndexes = async (collection, plan, existingIndexes) => {
  for (const desired of plan.indexes) {
    const exists = existingIndexes.some(({ name }) => name === desired.options.name);
    if (exists) {
      continue;
    }

    try {
      await collection.createIndex(desired.key, desired.options);
    } catch (error) {
      throw preflightError(
        `MongoDB could not create "${desired.options.name}" on "${plan.collectionName}" `
        + `(code ${error?.codeName || error?.code || 'unknown'}).`
      );
    }
  }
};

const verifyCollection = async (collection, plan) => {
  const existingIndexes = await listIndexes(collection);

  for (const desired of plan.indexes) {
    const existing = existingIndexes.find(({ name }) => name === desired.options.name);
    if (!existing || !indexMatchesPlan(existing, desired)) {
      throw preflightError(
        `Post-create verification failed for "${desired.options.name}" `
        + `on "${plan.collectionName}".`
      );
    }
  }
};

module.exports = {
  async up({ mongoose }) {
    const contexts = INDEX_PLANS.map((plan) => ({
      plan,
      collection: mongoose.connection.db.collection(plan.collectionName),
    }));

    // Complete all read-only compatibility and duplicate checks before the first
    // index build so a known conflict cannot leave the migration partly applied.
    const existingByCollection = [];
    for (const context of contexts) {
      existingByCollection.push(await preflightCollection(context.collection, context.plan));
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
  INDEX_PLANS,
  NON_REPLACEABLE_ATTEMPT_STATUSES,
  buildDuplicatePipeline,
  indexMatchesPlan,
  assertCompatibleIndexState,
  preflightCollection,
  createMissingIndexes,
  verifyCollection,
};
