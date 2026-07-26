const migration = require('../20260723-provider-account-deletion-indexes');
const AccountDeletionChallenge = require('../../../models/AccountDeletionChallenge');
const ProviderRevocationTask = require('../../../models/ProviderRevocationTask');

const clone = (value) => JSON.parse(JSON.stringify(value));
const generatedIndexName = (key) => Object.entries(key)
  .map(([field, direction]) => `${field}_${direction}`)
  .join('_');

const modelIndexContracts = (model) => model.schema.indexes().map(([key, options]) => ({
  key,
  options: {
    name: options.name || generatedIndexName(key),
    ...(options.unique ? { unique: true } : {}),
    ...(options.sparse ? { sparse: true } : {}),
    ...(options.expireAfterSeconds !== undefined
      ? { expireAfterSeconds: options.expireAfterSeconds }
      : {}),
  },
}));

const mongoIndexFromPlan = ({ key, options }) => ({
  v: 2,
  key: clone(key),
  name: options.name,
  ...(options.unique ? { unique: true } : {}),
  ...(options.expireAfterSeconds !== undefined
    ? { expireAfterSeconds: options.expireAfterSeconds }
    : {}),
});

const makeCollection = ({ existing = [], duplicateCalls = {} } = {}) => {
  let indexes = clone(existing);
  let aggregateCall = 0;
  return {
    indexes: jest.fn(async () => clone(indexes)),
    aggregate: jest.fn(() => {
      const call = aggregateCall;
      aggregateCall += 1;
      return { toArray: jest.fn(async () => clone(duplicateCalls[call] || [])) };
    }),
    createIndex: jest.fn(async (key, options) => {
      indexes.push(mongoIndexFromPlan({ key, options }));
      return options.name;
    }),
  };
};

const makeMongoose = (collections) => ({
  connection: {
    db: { collection: jest.fn((name) => collections[name]) },
  },
});

describe('provider account-deletion index migration', () => {
  test('covers every immutable model index including the challenge TTL', () => {
    const [challengePlan, revocationPlan] = migration.INDEX_PLANS;
    expect(challengePlan.collectionName).toBe(AccountDeletionChallenge.collection.collectionName);
    expect(revocationPlan.collectionName).toBe(ProviderRevocationTask.collection.collectionName);
    expect(challengePlan.indexes.map(({ key, options }) => ({ key, options })))
      .toEqual(modelIndexContracts(AccountDeletionChallenge));
    expect(revocationPlan.indexes.map(({ key, options }) => ({ key, options })))
      .toEqual(modelIndexContracts(ProviderRevocationTask));
  });

  test('preflights both collections before creating and verifies exact indexes', async () => {
    const collections = {
      accountdeletionchallenges: makeCollection(),
      providerrevocationtasks: makeCollection(),
    };
    await migration.up({ mongoose: makeMongoose(collections) });
    for (const plan of migration.INDEX_PLANS) {
      expect(collections[plan.collectionName].createIndex)
        .toHaveBeenCalledTimes(plan.indexes.length);
      expect(collections[plan.collectionName].indexes).toHaveBeenCalledTimes(2);
    }
  });

  test('is idempotent with every exact index already present', async () => {
    const collections = Object.fromEntries(migration.INDEX_PLANS.map((plan) => [
      plan.collectionName,
      makeCollection({ existing: plan.indexes.map(mongoIndexFromPlan) }),
    ]));
    await migration.up({ mongoose: makeMongoose(collections) });
    for (const collection of Object.values(collections)) {
      expect(collection.createIndex).not.toHaveBeenCalled();
    }
  });

  test('fails before any index build when a unique domain contains duplicates', async () => {
    const challenges = makeCollection({ duplicateCalls: { 0: [{ _id: 'redacted', count: 2 }] } });
    const revocations = makeCollection();
    await expect(migration.up({
      mongoose: makeMongoose({
        accountdeletionchallenges: challenges,
        providerrevocationtasks: revocations,
      }),
    })).rejects.toThrow(/duplicate account-deletion challenge IDs exist/);
    expect(challenges.createIndex).not.toHaveBeenCalled();
    expect(revocations.createIndex).not.toHaveBeenCalled();
  });

  test('fails closed on an incompatible TTL and never drops an index', async () => {
    const challenges = makeCollection({
      existing: [{
        v: 2,
        key: { expiresAt: 1 },
        name: 'expiresAt_1',
        expireAfterSeconds: 3600,
      }],
    });
    await expect(migration.up({
      mongoose: makeMongoose({
        accountdeletionchallenges: challenges,
        providerrevocationtasks: makeCollection(),
      }),
    })).rejects.toThrow(/exists with incompatible options/);
    expect(challenges.createIndex).not.toHaveBeenCalled();
    expect(challenges.dropIndex).toBeUndefined();
  });
});
