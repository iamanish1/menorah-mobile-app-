const migration = require('../20260803-android-push-notification-indexes');

const createHarness = ({ duplicatesByCollection = {}, indexesByCollection = {} } = {}) => {
  const creates = [];
  const collection = jest.fn((name) => ({
    indexes: jest.fn(async () => indexesByCollection[name] || []),
    aggregate: jest.fn(() => ({
      toArray: jest.fn(async () => duplicatesByCollection[name] || []),
    })),
    createIndex: jest.fn(async (key, options) => {
      creates.push({ collection: name, key, options });
      return options.name;
    }),
  }));

  return {
    creates,
    mongoose: { connection: { db: { collection } } },
  };
};

describe('20260803 Android push notification indexes', () => {
  test('defines unique device, notification-event, and receipt identities', () => {
    const uniqueNames = migration.PLANS.flatMap(({ indexes }) => indexes)
      .filter(({ options }) => options.unique)
      .map(({ options }) => options.name);

    expect(uniqueNames).toEqual([
      'push_device_token_hash_unique_v1',
      'push_notification_user_event_unique_v1',
      'push_receipt_id_unique_v1',
    ]);
  });

  test('creates every planned index after complete preflight', async () => {
    const harness = createHarness();
    await migration.up({ mongoose: harness.mongoose });

    expect(harness.creates).toHaveLength(
      migration.PLANS.reduce((total, { indexes }) => total + indexes.length, 0)
    );
  });

  test('performs no index write when a later unique domain contains duplicates', async () => {
    const harness = createHarness({
      duplicatesByCollection: {
        pushnotifications: [{ _id: { user: 'user-1', eventKey: 'event-1' }, count: 2 }],
      },
    });

    await expect(migration.up({ mongoose: harness.mongoose }))
      .rejects.toThrow(/Duplicate data blocks index "push_notification_user_event_unique_v1"/);
    expect(harness.creates).toEqual([]);
  });

  test('rejects an incompatible same-name index without replacing it', async () => {
    const harness = createHarness({
      indexesByCollection: {
        pushdevices: [{
          name: 'push_device_token_hash_unique_v1',
          key: { tokenHash: -1 },
          unique: true,
        }],
      },
    });

    await expect(migration.up({ mongoose: harness.mongoose }))
      .rejects.toThrow(/is incompatible/);
    expect(harness.creates).toEqual([]);
  });

  test.each([
    ['sparse', { sparse: true }],
    ['partial', { partialFilterExpression: { tokenHash: { $exists: true } } }],
    ['collated', { collation: { locale: 'en', strength: 2 } }],
    ['hidden', { hidden: true }],
  ])('rejects a same-name %s index that weakens the reviewed semantics', async (_label, options) => {
    const harness = createHarness({
      indexesByCollection: {
        pushdevices: [{
          name: 'push_device_token_hash_unique_v1',
          key: { tokenHash: 1 },
          unique: true,
          ...options,
        }],
      },
    });

    await expect(migration.up({ mongoose: harness.mongoose }))
      .rejects.toThrow(/is incompatible/);
    expect(harness.creates).toEqual([]);
  });
});
