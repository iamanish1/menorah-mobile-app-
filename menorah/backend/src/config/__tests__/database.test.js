const { buildMongooseOptions } = require('../database');

describe('database connection options', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MONGODB_REPLICA_SET_NAME;
    delete process.env.MONGODB_READ_PREFERENCE;
    delete process.env.MONGODB_RETRY_WRITES;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('adds replica set and read preference from env when URI does not include them', () => {
    process.env.MONGODB_REPLICA_SET_NAME = 'menorah-rs';
    process.env.MONGODB_READ_PREFERENCE = 'primaryPreferred';

    const options = buildMongooseOptions('mongodb://mongo-primary:27017/menorah');

    expect(options.replicaSet).toBe('menorah-rs');
    expect(options.readPreference).toBe('primaryPreferred');
    expect(options.retryWrites).toBe(true);
  });

  test('does not override replica set or read preference already present in URI', () => {
    process.env.MONGODB_REPLICA_SET_NAME = 'other-rs';
    process.env.MONGODB_READ_PREFERENCE = 'secondary';

    const options = buildMongooseOptions(
      'mongodb://mongo-primary:27017/menorah?replicaSet=menorah-rs&readPreference=primary'
    );

    expect(options.replicaSet).toBeUndefined();
    expect(options.readPreference).toBeUndefined();
  });
});
