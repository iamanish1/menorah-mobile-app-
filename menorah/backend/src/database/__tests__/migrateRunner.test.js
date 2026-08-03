const {
  MIGRATION_CONNECTION_OPTIONS,
  assertMigrationsDirectoryAvailable,
  assertExpectedPendingMigrations,
  parseExpectedPendingMigrations,
  requireExpectedPendingMigrations,
  resolvePendingMigrationPlan,
} = require('../migrate');

describe('migration runner connection safety', () => {
  test('prevents model initialization from mutating collections or indexes', () => {
    expect(MIGRATION_CONNECTION_OPTIONS).toEqual({
      autoIndex: false,
      autoCreate: false,
    });
  });
});

describe('release-specific pending migration contract', () => {
  const expected = [
    '20260802-booking-active-slot-index.js',
    '20260802-psychometric-assessment-indexes.js',
    '20260803-android-push-notification-indexes.js',
  ];

  test('accepts the exact pending set independent of order', () => {
    expect(() => assertExpectedPendingMigrations(
      [...expected].reverse(),
      expected.join(',')
    )).not.toThrow();
  });

  test('fails before migration when a historical or unexpected file is pending', () => {
    expect(() => assertExpectedPendingMigrations(
      ['20260723-payment-reconciliation-indexes.js', ...expected],
      expected.join(',')
    )).toThrow(/Pending migration plan mismatch.*No migration was run/);
  });

  test('rejects malformed and duplicate migration plans', () => {
    expect(() => parseExpectedPendingMigrations('not-a-migration.js')).toThrow();
    expect(() => parseExpectedPendingMigrations(`${expected[0]},${expected[0]}`)).toThrow();
  });

  test('requires an explicit exact plan for production execution', () => {
    expect(() => requireExpectedPendingMigrations(undefined))
      .toThrow(/required for production migration execution/);
    expect(() => assertExpectedPendingMigrations([], '', { required: true }))
      .toThrow(/required for production migration execution/);
  });

  test('requires the exact plan only for the production deployment environment', () => {
    expect(() => resolvePendingMigrationPlan({
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
    })).toThrow(/required for production migration execution/);

    expect(resolvePendingMigrationPlan({
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
    })).toEqual({
      rawExpected: undefined,
      productionPlanRequired: false,
      expected: null,
    });

    expect(resolvePendingMigrationPlan({
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
      MENORAH_EXPECTED_PENDING_MIGRATIONS: expected.join(','),
    })).toEqual({
      rawExpected: expected.join(','),
      productionPlanRequired: true,
      expected: [...expected].sort(),
    });
  });

  test('fails when an expected plan has no migrations directory', () => {
    expect(() => assertMigrationsDirectoryAvailable({
      exists: false,
      expected,
    })).toThrow(/migrations directory is missing/);
    expect(() => assertMigrationsDirectoryAvailable({
      exists: false,
      expected: null,
    })).not.toThrow();
  });
});
