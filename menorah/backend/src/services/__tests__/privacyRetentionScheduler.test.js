const mockProcessBatch = jest.fn();

jest.mock('../privacyRetention', () => ({
  DEFAULT_RETENTION_BATCH_SIZE: 25,
  privacyRetentionService: {
    processBatch: (...args) => mockProcessBatch(...args),
  },
}));

const {
  processDuePrivacyRetention,
  _private,
} = require('../privacyRetentionScheduler');

describe('privacy retention scheduler', () => {
  const originalBatchSize = process.env.PRIVACY_RETENTION_BATCH_SIZE;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalBatchSize === undefined) {
      delete process.env.PRIVACY_RETENTION_BATCH_SIZE;
    } else {
      process.env.PRIVACY_RETENTION_BATCH_SIZE = originalBatchSize;
    }
  });

  test('uses a bounded default input and returns the service summary', async () => {
    delete process.env.PRIVACY_RETENTION_BATCH_SIZE;
    mockProcessBatch.mockResolvedValue({
      disabled: true,
      scanned: 0,
      failed: 0,
    });

    await expect(processDuePrivacyRetention()).resolves.toEqual({
      disabled: true,
      scanned: 0,
      failed: 0,
    });
    expect(mockProcessBatch).toHaveBeenCalledWith({ limit: 25 });
  });

  test('does not overlap retention runs', async () => {
    let resolveFirst;
    mockProcessBatch.mockImplementation(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));

    const first = processDuePrivacyRetention();
    await expect(processDuePrivacyRetention()).resolves.toEqual({
      skipped: true,
      reason: 'privacy_retention_already_running',
    });
    resolveFirst({ disabled: false, scanned: 1, failed: 0 });
    await expect(first).resolves.toEqual({
      disabled: false,
      scanned: 1,
      failed: 0,
    });
  });

  test('uses the service clamp for oversized configured values', () => {
    process.env.PRIVACY_RETENTION_BATCH_SIZE = '1000';
    expect(_private.readBatchSize()).toBe(1000);
  });
});
