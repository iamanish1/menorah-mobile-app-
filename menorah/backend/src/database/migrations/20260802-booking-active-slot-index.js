const COLLECTION_NAME = 'bookings';
const INDEX_KEY = Object.freeze({ counsellor: 1, scheduledAt: 1 });
const ACTIVE_BOOKING_STATUSES = Object.freeze([
  'pending',
  'confirmed',
  'in-progress',
]);
const INDEX_OPTIONS = Object.freeze({
  name: 'counsellor_1_scheduledAt_1',
  unique: true,
  partialFilterExpression: {
    counsellor: { $exists: true, $type: 'objectId' },
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
  },
});

const preflightError = (message) => new Error(
  `[booking-slot-index-preflight] ${message} `
  + 'No booking records or existing indexes were deleted; remediate under an approved '
  + 'operator plan and rerun.'
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

const indexMatchesContract = (existing) => (
  sameIndexKey(existing?.key, INDEX_KEY)
  && existing?.name === INDEX_OPTIONS.name
  && existing?.unique === true
  && existing?.sparse !== true
  && sameDocument(
    existing?.partialFilterExpression || null,
    INDEX_OPTIONS.partialFilterExpression
  )
  && existing?.collation === undefined
  && existing?.expireAfterSeconds === undefined
  && existing?.hidden !== true
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

const assertCompatibleIndexState = (existingIndexes) => {
  const sameName = existingIndexes.find(({ name }) => name === INDEX_OPTIONS.name);
  if (sameName) {
    if (!indexMatchesContract(sameName)) {
      throw preflightError(
        `Index "${INDEX_OPTIONS.name}" exists with an incompatible key or options.`
      );
    }
    return true;
  }

  const sameKey = existingIndexes.find((existing) => sameIndexKey(existing.key, INDEX_KEY));
  if (sameKey) {
    throw preflightError(
      `The booking-slot key already exists as "${sameKey.name}" with a different name or options.`
    );
  }

  return false;
};

const duplicateActiveSlotPipeline = () => [
  {
    $match: {
      counsellor: { $type: 'objectId' },
      status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    },
  },
  {
    $group: {
      _id: {
        counsellor: '$counsellor',
        scheduledAt: '$scheduledAt',
      },
      count: { $sum: 1 },
    },
  },
  { $match: { count: { $gt: 1 } } },
  { $limit: 1 },
];

const assertNoDuplicateActiveSlots = async (collection) => {
  const duplicates = await collection.aggregate(
    duplicateActiveSlotPipeline(),
    { allowDiskUse: false }
  ).toArray();

  if (duplicates.length) {
    throw preflightError(
      `Cannot create "${INDEX_OPTIONS.name}": duplicate active bookings exist for at least `
      + 'one counsellor and start time.'
    );
  }
};

const createIndex = async (collection) => {
  try {
    await collection.createIndex(INDEX_KEY, INDEX_OPTIONS);
  } catch (error) {
    throw preflightError(
      `MongoDB could not create "${INDEX_OPTIONS.name}" `
      + `(code ${error?.codeName || error?.code || 'unknown'}).`
    );
  }
};

const verifyIndex = async (collection) => {
  const existingIndexes = await listIndexes(collection);
  const created = existingIndexes.find(({ name }) => name === INDEX_OPTIONS.name);
  if (!created || !indexMatchesContract(created)) {
    throw preflightError(
      `Post-create verification failed for "${INDEX_OPTIONS.name}".`
    );
  }
};

module.exports = {
  async up({ mongoose }) {
    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const existingIndexes = await listIndexes(collection);

    if (assertCompatibleIndexState(existingIndexes)) {
      return;
    }

    await assertNoDuplicateActiveSlots(collection);
    await createIndex(collection);
    await verifyIndex(collection);
  },
  COLLECTION_NAME,
  INDEX_KEY,
  INDEX_OPTIONS,
  ACTIVE_BOOKING_STATUSES,
  duplicateActiveSlotPipeline,
  indexMatchesContract,
  assertCompatibleIndexState,
  assertNoDuplicateActiveSlots,
  verifyIndex,
};
