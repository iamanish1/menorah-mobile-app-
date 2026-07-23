const mockSchedule = jest.fn();
const mockReconcileBatch = jest.fn();

jest.mock('node-cron', () => ({
  schedule: (...args) => mockSchedule(...args),
}));

jest.mock('../counsellorVerificationExpiry', () => ({
  DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE: 50,
  reconcileBatch: (...args) => mockReconcileBatch(...args),
}));

const {
  processDueCounsellorVerificationExpiries,
  startCounsellorVerificationExpiryScheduler,
} = require('../counsellorVerificationExpiryScheduler');

describe('counsellor verification expiry scheduler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COUNSELLOR_VERIFICATION_EXPIRY_BATCH_SIZE;
    mockSchedule.mockReset().mockReturnValue({ stop: jest.fn() });
    mockReconcileBatch.mockReset().mockResolvedValue({
      scanned: 0,
      expired: 0,
      alreadyReconciled: 0,
      failed: 0,
      failures: [],
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('runs at startup and schedules a non-overlapping UTC minute sweep', async () => {
    const task = startCounsellorVerificationExpiryScheduler();
    await Promise.resolve();

    expect(task).toEqual(expect.objectContaining({ stop: expect.any(Function) }));
    expect(mockReconcileBatch).toHaveBeenCalledWith({ limit: 50 });
    expect(mockSchedule).toHaveBeenCalledWith(
      '* * * * *',
      expect.any(Function),
      {
        timezone: 'UTC',
        noOverlap: true,
      }
    );
  });

  test('does not overlap an in-process reconciliation batch', async () => {
    let finish;
    mockReconcileBatch.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));

    const first = processDueCounsellorVerificationExpiries();
    await Promise.resolve();
    await expect(processDueCounsellorVerificationExpiries()).resolves.toEqual({
      skipped: true,
      reason: 'reconciliation_already_running',
    });

    finish({
      scanned: 0,
      expired: 0,
      alreadyReconciled: 0,
      failed: 0,
      failures: [],
    });
    await expect(first).resolves.toMatchObject({ failed: 0 });
  });
});
