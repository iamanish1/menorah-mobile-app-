const { MIGRATION_CONNECTION_OPTIONS } = require('../migrate');

describe('migration runner connection safety', () => {
  test('prevents model initialization from mutating collections or indexes', () => {
    expect(MIGRATION_CONNECTION_OPTIONS).toEqual({
      autoIndex: false,
      autoCreate: false,
    });
  });
});
