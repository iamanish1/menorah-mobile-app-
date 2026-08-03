const migration = require('../20260723-security-audit-ledger-indexes');

const createCollection = ({
  indexes = [{ name: '_id_', key: { _id: 1 }, unique: true }],
  duplicate = null,
} = {}) => {
  let currentIndexes = indexes.map((index) => ({ ...index }));
  return {
    indexes: jest.fn(async () => currentIndexes.map((index) => ({ ...index }))),
    aggregate: jest.fn(() => ({
      toArray: jest.fn(async () => (duplicate ? [duplicate] : [])),
    })),
    createIndex: jest.fn(async (key, options) => {
      currentIndexes.push({ key, ...options });
      return options.name;
    }),
  };
};

describe('security audit ledger index migration', () => {
  test('creates and verifies unique sequence, event ID, and checkpoint indexes without TTL', async () => {
    const collections = new Map([
      ['securityauditevents', createCollection()],
      ['securityauditcheckpoints', createCollection()],
    ]);
    const mongoose = {
      connection: {
        db: {
          collection: jest.fn((name) => collections.get(name)),
        },
      },
    };

    await migration.up({ mongoose });

    const eventIndexes = collections.get('securityauditevents').createIndex.mock.calls;
    expect(eventIndexes).toEqual(expect.arrayContaining([
      [
        { eventId: 1 },
        { name: 'security_audit_event_id_unique_v1', unique: true },
      ],
      [
        { scope: 1, sequence: 1 },
        { name: 'security_audit_scope_sequence_unique_v1', unique: true },
      ],
    ]));
    expect(JSON.stringify(migration.INDEX_PLANS)).not.toContain('expireAfterSeconds');
  });

  test('fails before creating any indexes when duplicate ledger coordinates exist', async () => {
    const events = createCollection({ duplicate: { _id: 'duplicate', count: 2 } });
    const checkpoints = createCollection();
    const mongoose = {
      connection: {
        db: {
          collection: jest.fn((name) => (
            name === 'securityauditevents' ? events : checkpoints
          )),
        },
      },
    };

    await expect(migration.up({ mongoose })).rejects.toThrow(
      /\[security-audit-index-preflight\].*duplicate security-audit event IDs/
    );
    expect(events.createIndex).not.toHaveBeenCalled();
    expect(checkpoints.createIndex).not.toHaveBeenCalled();
  });

  test('rejects a same-name index whose uniqueness differs from the contract', async () => {
    const events = createCollection({
      indexes: [
        { name: '_id_', key: { _id: 1 }, unique: true },
        {
          name: 'security_audit_event_id_unique_v1',
          key: { eventId: 1 },
          unique: false,
        },
      ],
    });
    const checkpoints = createCollection();
    const mongoose = {
      connection: {
        db: {
          collection: jest.fn((name) => (
            name === 'securityauditevents' ? events : checkpoints
          )),
        },
      },
    };

    await expect(migration.up({ mongoose })).rejects.toThrow(/incompatible options/);
    expect(events.createIndex).not.toHaveBeenCalled();
    expect(checkpoints.createIndex).not.toHaveBeenCalled();
  });
});
