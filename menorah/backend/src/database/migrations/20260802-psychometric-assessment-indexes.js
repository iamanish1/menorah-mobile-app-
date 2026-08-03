const COLLECTION_NAME = 'psychometricassessments';

const INDEXES = Object.freeze([
  {
    key: { user: 1, idempotencyKeyHash: 1 },
    options: {
      name: 'assessment_user_idempotency_unique_v1',
      unique: true,
    },
    duplicateCheck: {
      groupBy: {
        user: '$user',
        idempotencyKeyHash: '$idempotencyKeyHash',
      },
      description: 'user-scoped assessment idempotency keys',
    },
  },
  {
    key: { user: 1, completedAt: -1 },
    options: { name: 'assessment_user_completedAt_v1' },
  },
  {
    key: { user: 1, assessmentType: 1, completedAt: -1 },
    options: { name: 'assessment_user_type_completedAt_v1' },
  },
]);

const preflightError = (message) => new Error(
  `[psychometric-assessment-index-preflight] ${message} `
  + 'No assessment records or existing indexes were deleted; remediate under an approved '
  + 'operator plan and rerun.'
);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
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
  sameIndexKey(existing?.key, desired.key)
  && existing?.name === desired.options.name
  && Boolean(existing?.unique) === Boolean(desired.options.unique)
  && existing?.sparse !== true
  && sameDocument(
    existing?.partialFilterExpression || null,
    desired.options.partialFilterExpression || null
  )
  && existing?.collation === undefined
  && existing?.expireAfterSeconds === undefined
  && existing?.hidden !== true
);

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const assertCompatibleIndexState = (existingIndexes, desired) => {
  const sameName = existingIndexes.find(({ name }) => name === desired.options.name);
  if (sameName) {
    if (!indexMatchesPlan(sameName, desired)) {
      throw preflightError(
        `Index "${desired.options.name}" exists with an incompatible key or options.`
      );
    }
    return true;
  }

  const sameKey = existingIndexes.find((existing) => sameIndexKey(existing.key, desired.key));
  if (sameKey) {
    throw preflightError(
      `Index key for "${desired.options.name}" already exists as "${sameKey.name}" `
      + 'with a different name or options.'
    );
  }
  return false;
};

const duplicatePipeline = (duplicateCheck) => [
  {
    $group: {
      _id: duplicateCheck.groupBy,
      count: { $sum: 1 },
    },
  },
  { $match: { count: { $gt: 1 } } },
  { $limit: 1 },
];

const assertNoDuplicates = async (collection, desired) => {
  if (!desired.duplicateCheck) return;
  const duplicates = await collection.aggregate(
    duplicatePipeline(desired.duplicateCheck),
    { allowDiskUse: false }
  ).toArray();
  if (duplicates.length) {
    throw preflightError(
      `Cannot create "${desired.options.name}": duplicate `
      + `${desired.duplicateCheck.description} exist.`
    );
  }
};

const createMissingIndexes = async (collection, existingIndexes) => {
  for (const desired of INDEXES) {
    if (existingIndexes.some(({ name }) => name === desired.options.name)) continue;
    try {
      await collection.createIndex(desired.key, desired.options);
    } catch (error) {
      throw preflightError(
        `MongoDB could not create "${desired.options.name}" `
        + `(code ${error?.codeName || error?.code || 'unknown'}).`
      );
    }
  }
};

const verifyIndexes = async (collection) => {
  const existingIndexes = await listIndexes(collection);
  for (const desired of INDEXES) {
    const existing = existingIndexes.find(({ name }) => name === desired.options.name);
    if (!existing || !indexMatchesPlan(existing, desired)) {
      throw preflightError(
        `Post-create verification failed for "${desired.options.name}".`
      );
    }
  }
};

module.exports = {
  async up({ mongoose }) {
    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const existingIndexes = await listIndexes(collection);

    for (const desired of INDEXES) {
      assertCompatibleIndexState(existingIndexes, desired);
      await assertNoDuplicates(collection, desired);
    }

    await createMissingIndexes(collection, existingIndexes);
    await verifyIndexes(collection);
  },
  COLLECTION_NAME,
  INDEXES,
  assertCompatibleIndexState,
  assertNoDuplicates,
  createMissingIndexes,
  duplicatePipeline,
  indexMatchesPlan,
  verifyIndexes,
};
