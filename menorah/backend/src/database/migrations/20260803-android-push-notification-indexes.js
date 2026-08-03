const { isDeepStrictEqual } = require('util');

const PLANS = Object.freeze([
  {
    collection: 'pushdevices',
    indexes: [
      {
        key: { tokenHash: 1 },
        options: { unique: true, name: 'push_device_token_hash_unique_v1' },
        duplicateFields: { tokenHash: '$tokenHash' },
      },
      {
        key: { user: 1, active: 1, updatedAt: -1 },
        options: { name: 'push_device_user_active_v1' },
      },
    ],
  },
  {
    collection: 'pushnotifications',
    indexes: [
      {
        key: { user: 1, eventKey: 1 },
        options: { unique: true, name: 'push_notification_user_event_unique_v1' },
        duplicateFields: { user: '$user', eventKey: '$eventKey' },
      },
      {
        key: { status: 1, scheduledFor: 1, nextAttemptAt: 1 },
        options: { name: 'push_notification_queue_v1' },
      },
      {
        key: { status: 1, leaseUntil: 1 },
        options: { name: 'push_notification_lease_v1' },
      },
    ],
  },
  {
    collection: 'pushreceipts',
    indexes: [
      {
        key: { receiptId: 1 },
        options: { unique: true, name: 'push_receipt_id_unique_v1' },
        duplicateFields: { receiptId: '$receiptId' },
      },
      {
        key: { status: 1, availableAt: 1 },
        options: { name: 'push_receipt_pending_v1' },
      },
      {
        key: { device: 1, createdAt: -1 },
        options: { name: 'push_receipt_device_v1' },
      },
    ],
  },
]);

const migrationError = (message) => new Error(
  `[android-push-index-preflight] ${message} No records or indexes were deleted.`
);

const sameKey = (left, right) => JSON.stringify(Object.entries(left || {}))
  === JSON.stringify(Object.entries(right || {}));

const semanticIndexOptions = (index = {}) => ({
  unique: Boolean(index.unique),
  sparse: Boolean(index.sparse),
  hidden: Boolean(index.hidden),
  prepareUnique: Boolean(index.prepareUnique),
  partialFilterExpression: index.partialFilterExpression || null,
  collation: index.collation || null,
  expireAfterSeconds: index.expireAfterSeconds ?? null,
  wildcardProjection: index.wildcardProjection || null,
});

const sameIndexOptions = (existing, desiredOptions) => isDeepStrictEqual(
  semanticIndexOptions(existing),
  semanticIndexOptions(desiredOptions)
);

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const assertNoDuplicates = async (collection, index) => {
  if (!index.duplicateFields) return;
  const duplicate = await collection.aggregate([
    { $group: { _id: index.duplicateFields, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ], { allowDiskUse: false }).toArray();
  if (duplicate.length) {
    throw migrationError(`Duplicate data blocks index "${index.options.name}".`);
  }
};

module.exports = {
  async up({ mongoose }) {
    const preflight = [];
    for (const plan of PLANS) {
      const collection = mongoose.connection.db.collection(plan.collection);
      const existing = await listIndexes(collection);

      for (const desired of plan.indexes) {
        const byName = existing.find(({ name }) => name === desired.options.name);
        if (byName && (
          !sameKey(byName.key, desired.key)
          || !sameIndexOptions(byName, desired.options)
        )) {
          throw migrationError(`Index "${desired.options.name}" is incompatible.`);
        }
        const byKey = existing.find(({ key }) => sameKey(key, desired.key));
        if (!byName && byKey) {
          throw migrationError(
            `Index key for "${desired.options.name}" already exists as "${byKey.name}".`
          );
        }
        if (!byName) await assertNoDuplicates(collection, desired);
      }

      preflight.push({ collection, existing, plan });
    }

    // Build only after every collection, index shape, and unique domain has
    // passed. A conflict in a later collection therefore cannot leave a
    // partially applied release migration.
    for (const { collection, existing, plan } of preflight) {
      for (const desired of plan.indexes) {
        if (!existing.some(({ name }) => name === desired.options.name)) {
          await collection.createIndex(desired.key, desired.options);
        }
      }
    }
  },
  PLANS,
  assertNoDuplicates,
  listIndexes,
  sameKey,
  sameIndexOptions,
  semanticIndexOptions,
};
