const migration = require('../20260802-booking-active-slot-index');
const Booking = require('../../../models/Booking');

const clone = (value) => JSON.parse(JSON.stringify(value));

const mongoIndexFromContract = (overrides = {}) => ({
  v: 2,
  key: clone(migration.INDEX_KEY),
  name: migration.INDEX_OPTIONS.name,
  unique: true,
  partialFilterExpression: clone(migration.INDEX_OPTIONS.partialFilterExpression),
  ...overrides,
});

const makeCollection = ({
  indexes = [],
  duplicates = [],
  storeCreatedIndex = true,
  createError,
} = {}) => {
  let storedIndexes = clone(indexes);

  return {
    indexes: jest.fn(async () => clone(storedIndexes)),
    aggregate: jest.fn(() => ({
      toArray: jest.fn(async () => clone(duplicates)),
    })),
    createIndex: jest.fn(async (key, options) => {
      if (createError) throw createError;
      if (storeCreatedIndex) {
        storedIndexes.push(mongoIndexFromContract({
          key: clone(key),
          name: options.name,
          unique: options.unique,
          partialFilterExpression: clone(options.partialFilterExpression),
        }));
      }
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

describe('20260802 active counsellor booking slot index migration', () => {
  test('stays aligned with the Booking model index contract', () => {
    const modelIndex = Booking.schema.indexes().find(([key]) => (
      key.counsellor === 1 && key.scheduledAt === 1
    ));

    expect(modelIndex).toBeTruthy();
    expect(modelIndex[0]).toEqual(migration.INDEX_KEY);
    expect(modelIndex[1]).toMatchObject(migration.INDEX_OPTIONS);
  });

  test('creates and verifies the missing index after a read-only duplicate preflight', async () => {
    const collection = makeCollection();

    await migration.up({ mongoose: makeMongoose(collection) });

    expect(collection.aggregate).toHaveBeenCalledWith(
      migration.duplicateActiveSlotPipeline(),
      { allowDiskUse: false }
    );
    expect(collection.createIndex).toHaveBeenCalledWith(
      migration.INDEX_KEY,
      migration.INDEX_OPTIONS
    );
    expect(collection.indexes).toHaveBeenCalledTimes(2);
  });

  test('is idempotent when the exact index already exists', async () => {
    const collection = makeCollection({ indexes: [mongoIndexFromContract()] });

    await migration.up({ mongoose: makeMongoose(collection) });

    expect(collection.aggregate).not.toHaveBeenCalled();
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.indexes).toHaveBeenCalledTimes(1);
  });

  test('fails closed without creating an index when duplicate active slots exist', async () => {
    const collection = makeCollection({
      duplicates: [{
        _id: {
          counsellor: '64f000000000000000000001',
          scheduledAt: '2099-01-15T10:00:00.000Z',
        },
        count: 2,
      }],
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/duplicate active bookings/i);

    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test.each([
    ['missing uniqueness', mongoIndexFromContract({ unique: undefined })],
    ['an incompatible partial filter', mongoIndexFromContract({
      partialFilterExpression: { status: { $in: ['confirmed'] } },
    })],
    ['a conflicting key', mongoIndexFromContract({
      key: { counsellor: 1, scheduledAt: -1 },
    })],
  ])('fails closed when the desired index name has %s', async (_label, index) => {
    const collection = makeCollection({ indexes: [index] });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/incompatible key or options/i);

    expect(collection.aggregate).not.toHaveBeenCalled();
    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test('fails closed when the same key exists under a different contract', async () => {
    const collection = makeCollection({
      indexes: [mongoIndexFromContract({ name: 'legacy_booking_slot_index' })],
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/different name or options/i);

    expect(collection.aggregate).not.toHaveBeenCalled();
    expect(collection.createIndex).not.toHaveBeenCalled();
  });

  test('wraps index build failures without deleting data or existing indexes', async () => {
    const collection = makeCollection({
      createError: Object.assign(new Error('duplicate key details'), { code: 11000 }),
    });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/MongoDB could not create.*code 11000/i);
  });

  test('fails closed when MongoDB does not report the new index after creation', async () => {
    const collection = makeCollection({ storeCreatedIndex: false });

    await expect(migration.up({ mongoose: makeMongoose(collection) }))
      .rejects.toThrow(/Post-create verification failed/i);
  });
});
