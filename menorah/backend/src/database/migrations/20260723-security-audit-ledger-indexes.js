const INDEX_PLANS = Object.freeze([
  {
    collectionName: 'securityauditevents',
    indexes: [
      {
        key: { eventId: 1 },
        options: { name: 'security_audit_event_id_unique_v1', unique: true },
        duplicateCheck: {
          groupBy: '$eventId',
          description: 'security-audit event IDs',
        },
      },
      {
        key: { scope: 1, sequence: 1 },
        options: { name: 'security_audit_scope_sequence_unique_v1', unique: true },
        duplicateCheck: {
          groupBy: { scope: '$scope', sequence: '$sequence' },
          description: 'security-audit scope/sequence pairs',
        },
      },
      {
        key: { scope: 1, timestamp: 1 },
        options: { name: 'security_audit_scope_timestamp_v1' },
      },
    ],
  },
  {
    collectionName: 'securityauditcheckpoints',
    indexes: [
      {
        key: { scope: 1 },
        options: { name: 'security_audit_checkpoint_scope_unique_v1', unique: true },
        duplicateCheck: {
          groupBy: '$scope',
          description: 'security-audit checkpoints per scope',
        },
      },
    ],
  },
]);

const preflightError = (message) => new Error(
  `[security-audit-index-preflight] ${message} `
  + 'No audit records or indexes were deleted; investigate under an approved operator plan and rerun.'
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
  && existing.expireAfterSeconds === undefined
  && existing.partialFilterExpression === undefined
  && existing.collation === undefined
  && existing.hidden !== true
);

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const preflightCollection = async (collection, plan) => {
  const existingIndexes = await listIndexes(collection);
  for (const desired of plan.indexes) {
    const sameName = existingIndexes.find(({ name }) => name === desired.options.name);
    if (sameName && !indexMatchesPlan(sameName, desired)) {
      throw preflightError(
        `Index "${desired.options.name}" on "${plan.collectionName}" has incompatible options.`
      );
    }
    if (!sameName) {
      const sameKey = existingIndexes.find((existing) => sameIndexKey(existing.key, desired.key));
      if (sameKey) {
        throw preflightError(
          `Index key for "${desired.options.name}" on "${plan.collectionName}" already exists as `
          + `"${sameKey.name}" with a different name or options.`
        );
      }
    }
    if (desired.duplicateCheck) {
      const duplicates = await collection.aggregate([
        { $group: { _id: desired.duplicateCheck.groupBy, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ], { allowDiskUse: false }).toArray();
      if (duplicates.length > 0) {
        throw preflightError(
          `Cannot create "${desired.options.name}" on "${plan.collectionName}": duplicate `
          + `${desired.duplicateCheck.description} exist.`
        );
      }
    }
  }
  return existingIndexes;
};

const createMissingIndexes = async (collection, plan, existingIndexes) => {
  for (const desired of plan.indexes) {
    if (existingIndexes.some(({ name }) => name === desired.options.name)) continue;
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
        `Post-create verification failed for "${desired.options.name}" on "${plan.collectionName}".`
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
  indexMatchesPlan,
  sameIndexKey,
};
