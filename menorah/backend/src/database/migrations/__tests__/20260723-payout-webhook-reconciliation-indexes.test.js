const migration = require('../20260723-payout-webhook-reconciliation-indexes');
const Payout = require('../../../models/Payout');
const PayoutWebhookEvent = require('../../../models/PayoutWebhookEvent');

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
    ...(options.partialFilterExpression
      ? { partialFilterExpression: options.partialFilterExpression }
      : {}),
  },
}));

const mongoIndexFromPlan = ({ key, options }) => ({
  v: 2,
  key: clone(key),
  name: options.name,
  ...(options.unique ? { unique: true } : {}),
  ...(options.sparse ? { sparse: true } : {}),
});

const makeCollection = ({ existing = [] } = {}) => {
  let indexes = clone(existing);
  return {
    indexes: jest.fn(async () => clone(indexes)),
    aggregate: jest.fn(() => ({ toArray: jest.fn(async () => []) })),
    createIndex: jest.fn(async (key, options) => {
      indexes.push(mongoIndexFromPlan({ key, options }));
      return options.name;
    }),
  };
};

const makeMongoose = (collections) => ({
  connection: {
    db: {
      collection: jest.fn((name) => collections[name]),
    },
  },
});

describe('20260723 payout webhook reconciliation index migration', () => {
  const [payoutPlan, webhookPlan] = migration.INDEX_PLANS;

  test('covers every new payout reconciliation index and all webhook indexes', () => {
    const payoutIndexes = modelIndexContracts(Payout).filter(({ options }) => (
      options.name.startsWith('reconciliationStatus_')
    ));
    expect(payoutPlan).toEqual({
      collectionName: Payout.collection.collectionName,
      indexes: payoutIndexes,
    });
    expect(webhookPlan).toEqual({
      collectionName: PayoutWebhookEvent.collection.collectionName,
      indexes: modelIndexContracts(PayoutWebhookEvent).map((index) => {
        const plan = webhookPlan.indexes.find(({ options }) => (
          options.name === index.options.name
        ));
        return plan;
      }),
    });
  });

  test('preflights both collections before creating and verifies exact indexes', async () => {
    const collections = {
      payouts: makeCollection(),
      payoutwebhookevents: makeCollection(),
    };

    await migration.up({ mongoose: makeMongoose(collections) });

    expect(collections.payouts.createIndex).toHaveBeenCalledTimes(
      payoutPlan.indexes.length
    );
    expect(collections.payoutwebhookevents.createIndex).toHaveBeenCalledTimes(
      webhookPlan.indexes.length
    );
    expect(collections.payouts.indexes).toHaveBeenCalledTimes(2);
    expect(collections.payoutwebhookevents.indexes).toHaveBeenCalledTimes(2);
  });

  test('is idempotent with every exact index already present', async () => {
    const collections = Object.fromEntries(migration.INDEX_PLANS.map((plan) => [
      plan.collectionName,
      makeCollection({ existing: plan.indexes.map(mongoIndexFromPlan) }),
    ]));

    await migration.up({ mongoose: makeMongoose(collections) });

    expect(collections.payouts.createIndex).not.toHaveBeenCalled();
    expect(collections.payoutwebhookevents.createIndex).not.toHaveBeenCalled();
  });

  test('fails before any write when a webhook unique identity is duplicated', async () => {
    const payouts = makeCollection();
    const webhooks = makeCollection();
    let aggregateCall = 0;
    webhooks.aggregate.mockImplementation(() => {
      const call = aggregateCall;
      aggregateCall += 1;
      return {
        toArray: jest.fn(async () => (
          call === 0 ? [{ _id: 'redacted', count: 2 }] : []
        )),
      };
    });

    await expect(migration.up({
      mongoose: makeMongoose({
        payouts,
        payoutwebhookevents: webhooks,
      }),
    })).rejects.toThrow(/duplicate payout webhook event keys exist/);

    expect(payouts.createIndex).not.toHaveBeenCalled();
    expect(webhooks.createIndex).not.toHaveBeenCalled();
  });
});
