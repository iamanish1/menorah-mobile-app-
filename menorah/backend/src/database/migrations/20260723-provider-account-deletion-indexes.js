const INDEX_PLANS = Object.freeze([
  {
    collectionName: 'accountdeletionchallenges',
    indexes: [
      {
        key: { challengeId: 1 },
        options: { name: 'challengeId_1', unique: true },
        duplicateCheck: {
          groupBy: '$challengeId',
          description: 'account-deletion challenge IDs',
        },
      },
      {
        key: { user: 1 },
        options: { name: 'user_1' },
      },
      {
        key: { expiresAt: 1 },
        options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
      },
      {
        key: { user: 1, method: 1, consumedAt: 1, expiresAt: 1 },
        options: { name: 'user_1_method_1_consumedAt_1_expiresAt_1' },
      },
    ],
  },
  {
    collectionName: 'providerrevocationtasks',
    indexes: [
      {
        key: { status: 1 },
        options: { name: 'status_1' },
      },
      {
        key: { nextAttemptAt: 1 },
        options: { name: 'nextAttemptAt_1' },
      },
      {
        key: { user: 1, provider: 1 },
        options: { name: 'user_1_provider_1', unique: true },
        duplicateCheck: {
          groupBy: { user: '$user', provider: '$provider' },
          description: 'provider-revocation tasks for the same user and provider',
        },
      },
      {
        key: { status: 1, nextAttemptAt: 1, lockedUntil: 1 },
        options: { name: 'status_1_nextAttemptAt_1_lockedUntil_1' },
      },
    ],
  },
]);

const preflightError = (message) => new Error(
  `[provider-deletion-index-preflight] ${message} `
  + 'No records or existing indexes were deleted; remediate under an approved operator plan and rerun.'
);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
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

const normalizedOption = (value) => (value === undefined ? null : value);
const indexMatchesPlan = (existing, desired) => (
  sameIndexKey(existing.key, desired.key)
  && Boolean(existing.unique) === Boolean(desired.options.unique)
  && Boolean(existing.sparse) === Boolean(desired.options.sparse)
  && sameDocument(
    existing.partialFilterExpression || null,
    desired.options.partialFilterExpression || null
  )
  && normalizedOption(existing.expireAfterSeconds)
    === normalizedOption(desired.options.expireAfterSeconds)
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

const buildDuplicatePipeline = ({ groupBy }) => [
  { $group: { _id: groupBy, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $limit: 1 },
];

const preflightCollection = async (collection, plan) => {
  const existingIndexes = await listIndexes(collection);
  for (const desired of plan.indexes) {
    const sameName = existingIndexes.find(({ name }) => name === desired.options.name);
    if (sameName && !indexMatchesPlan(sameName, desired)) {
      throw preflightError(
        `Index "${desired.options.name}" on "${plan.collectionName}" exists with incompatible options.`
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
      const duplicates = await collection
        .aggregate(buildDuplicatePipeline(desired.duplicateCheck), { allowDiskUse: false })
        .toArray();
      if (duplicates.length) {
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
    for (const context of contexts) await verifyCollection(context.collection, context.plan);
  },
  INDEX_PLANS,
  buildDuplicatePipeline,
  indexMatchesPlan,
};
