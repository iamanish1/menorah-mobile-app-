const migration = require('../20260802-psychometric-assessment-indexes');
const PsychometricAssessment = require('../../../models/PsychometricAssessment');

const clone = (value) => JSON.parse(JSON.stringify(value));

const mongoIndexFromPlan = (desired, overrides = {}) => ({
  v: 2,
  key: clone(desired.key),
  name: desired.options.name,
  ...(desired.options.unique ? { unique: true } : {}),
  ...overrides,
});

const makeCollection = ({ indexes = [], duplicates = {} } = {}) => {
  let storedIndexes = clone(indexes);
  return {
    indexes: jest.fn(async () => clone(storedIndexes)),
    aggregate: jest.fn((pipeline) => ({
      toArray: jest.fn(async () => clone(
        duplicates[JSON.stringify(pipeline)] || []
      )),
    })),
    createIndex: jest.fn(async (key, options) => {
      const desired = { key, options };
      storedIndexes.push(mongoIndexFromPlan(desired));
      return options.name;
    }),
  };
};

const makeMongoose = (collection) => ({
  connection: {
    db: {
      collection: jest.fn((name) => {
        expect(name).toBe(migration.COLLECTION_NAME);
        return collection;
      }),
    },
  },
});

const modelIndexContracts = () => PsychometricAssessment.schema.indexes()
  .map(([key, options]) => ({
    key,
    options: {
      name: options.name,
      ...(options.unique ? { unique: true } : {}),
    },
  }));

describe('20260802 psychometric assessment index migration', () => {
  test('stays aligned with every model index contract', () => {
    expect(migration.COLLECTION_NAME)
      .toBe(PsychometricAssessment.collection.collectionName);
    expect(migration.INDEXES.map(({ key, options }) => ({ key, options })))
      .toEqual(modelIndexContracts());
  });

  test('creates all missing indexes and verifies them', async () => {
    const collection = makeCollection();
    await migration.up({ mongoose: makeMongoose(collection) });

    expect(collection.createIndex).toHaveBeenCalledTimes(migration.INDEXES.length);
    migration.INDEXES.forEach(({ key, options }) => {
      expect(collection.createIndex).toHaveBeenCalledWith(key, options);
    });
    expect(collection.indexes).toHaveBeenCalledTimes(2);
  });

  test('is idempotent when every exact index already exists', async () => {
    const collection = makeCollection({
      indexes: migration.INDEXES.map(mongoIndexFromPlan),
    });

    await migration.up({ mongoose: makeMongoose(collection) });

    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.indexes).toHaveBeenCalledTimes(2);
  });

  test('fails closed before index creation when duplicate idempotency records exist', async () => {
    const uniqueIndex = migration.INDEXES.find(({ options }) => options.unique);
    const pipeline = migration.duplicatePipeline(uniqueIndex.duplicateCheck);
    const collection = makeCollection({
      duplicates: {
        [JSON.stringify(pipeline)]: [{
          _id: { user: 'user-a', idempotencyKeyHash: 'a'.repeat(64) },
          count: 2,
        }],
      },
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/duplicate user-scoped assessment idempotency keys/i);
    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test('fails closed for an incompatible same-name index', async () => {
    const desired = migration.INDEXES[0];
    const collection = makeCollection({
      indexes: [mongoIndexFromPlan(desired, { unique: undefined })],
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/incompatible key or options/i);
    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test('fails closed when the same key exists under another name', async () => {
    const desired = migration.INDEXES[0];
    const collection = makeCollection({
      indexes: [mongoIndexFromPlan(desired, { name: 'legacy_assessment_index' })],
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/different name or options/i);
    expect(collection.createIndex).not.toHaveBeenCalled();
  });
});
