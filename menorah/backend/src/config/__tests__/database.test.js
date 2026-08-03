const { buildMongooseOptions } = require('../database');

describe('database connection options', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  test('disables implicit model index creation in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };

    expect(buildMongooseOptions('mongodb://localhost:27017/menorah')).toEqual(
      expect.objectContaining({ autoIndex: false, autoCreate: false })
    );
  });

  test('keeps automatic indexes available to isolated development and test databases', () => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };

    expect(buildMongooseOptions('mongodb://localhost:27017/menorah_test')).toEqual(
      expect.objectContaining({ autoIndex: true, autoCreate: true })
    );
  });
});
