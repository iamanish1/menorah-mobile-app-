const {
  MAX_ATTEMPTS,
  createProviderRevocationProcessor,
} = require('../providerRevocationService');

const NOW = new Date('2026-07-23T14:00:00.000Z');
const USER_ID = '64f000000000000000000001';
const TASK_ID = '64f000000000000000000020';
const CLIENT_ID = 'com.menorah.health';
const ENCRYPTED_TOKEN = 'v1:iv:tag:encrypted-apple-refresh-token';
const REFRESH_TOKEN = 'decrypted-refresh-token-never-for-logs';

const makeTask = (overrides = {}) => ({
  _id: TASK_ID,
  user: USER_ID,
  provider: 'apple',
  clientId: CLIENT_ID,
  refreshTokenEncrypted: ENCRYPTED_TOKEN,
  status: 'processing',
  attempts: 1,
  ...overrides,
});

const makeHarness = ({
  claimedTasks = [makeTask()],
  revokeError = null,
  decryptError = null,
  completionModifiedCount = 1,
} = {}) => {
  const queries = [];
  const taskQueue = [...claimedTasks];
  const TaskModel = {
    findOneAndUpdate: jest.fn(() => {
      const query = {
        select: jest.fn().mockResolvedValue(taskQueue.shift() || null),
      };
      queries.push(query);
      return query;
    }),
    updateOne: jest.fn().mockResolvedValue({
      modifiedCount: completionModifiedCount,
    }),
  };
  const revokeToken = revokeError
    ? jest.fn().mockRejectedValue(revokeError)
    : jest.fn().mockResolvedValue(undefined);
  const decryptToken = decryptError
    ? jest.fn(() => { throw decryptError; })
    : jest.fn(() => REFRESH_TOKEN);
  const processor = createProviderRevocationProcessor({
    TaskModel,
    revokeToken,
    decryptToken,
  });

  return {
    processor,
    TaskModel,
    revokeToken,
    decryptToken,
    queries,
  };
};

describe('provider revocation processor', () => {
  test('atomically claims due or abandoned work and selects the protected credential fields', async () => {
    const harness = makeHarness();

    await harness.processor.processNext({ now: NOW });

    expect(harness.TaskModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = harness.TaskModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      $or: [
        {
          status: { $in: ['pending', 'retry'] },
          nextAttemptAt: { $lte: NOW },
        },
        {
          status: 'processing',
          lockedUntil: { $lte: NOW },
        },
      ],
    });
    expect(update).toMatchObject({
      $set: {
        status: 'processing',
        lockedUntil: new Date('2026-07-23T14:02:00.000Z'),
        lockTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      $inc: { attempts: 1 },
    });
    expect(options).toEqual({
      new: true,
      sort: { nextAttemptAt: 1, createdAt: 1 },
    });
    expect(harness.queries[0].select)
      .toHaveBeenCalledWith('+clientId +refreshTokenEncrypted +lockTokenHash');
  });

  test('decrypts with bound context, revokes once, and purges credentials on idempotent success', async () => {
    const harness = makeHarness({
      claimedTasks: [makeTask(), null],
    });

    await expect(harness.processor.processNext({ now: NOW })).resolves.toEqual({
      taskId: TASK_ID,
      status: 'completed',
    });
    await expect(harness.processor.processNext({ now: NOW })).resolves.toBeNull();

    expect(harness.decryptToken).toHaveBeenCalledTimes(1);
    expect(harness.decryptToken).toHaveBeenCalledWith(ENCRYPTED_TOKEN, {
      userId: USER_ID,
      clientId: CLIENT_ID,
    });
    expect(harness.revokeToken).toHaveBeenCalledTimes(1);
    expect(harness.revokeToken).toHaveBeenCalledWith({
      token: REFRESH_TOKEN,
      clientId: CLIENT_ID,
    });

    const claimUpdate = harness.TaskModel.findOneAndUpdate.mock.calls[0][1];
    const lockTokenHash = claimUpdate.$set.lockTokenHash;
    expect(harness.TaskModel.updateOne).toHaveBeenCalledWith(
      {
        _id: TASK_ID,
        status: 'processing',
        lockTokenHash,
      },
      {
        $set: {
          status: 'completed',
          completedAt: NOW,
          lockedUntil: null,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
        $unset: {
          refreshTokenEncrypted: '',
          clientId: '',
          lockTokenHash: '',
        },
      }
    );
  });

  test('retries transient provider failure with bounded exponential delay and error code', async () => {
    const providerError = new Error('provider response contained sensitive details');
    providerError.response = {
      data: {
        error: 'invalid_grant',
        refresh_token: REFRESH_TOKEN,
      },
    };
    const harness = makeHarness({
      claimedTasks: [makeTask({ attempts: 3 })],
      revokeError: providerError,
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(harness.processor.processNext({ now: NOW })).resolves.toEqual({
      taskId: TASK_ID,
      status: 'retry',
      errorCode: 'APPLE_INVALID_GRANT',
    });

    const lockTokenHash = harness.TaskModel.findOneAndUpdate.mock.calls[0][1]
      .$set.lockTokenHash;
    expect(harness.TaskModel.updateOne).toHaveBeenCalledWith(
      { _id: TASK_ID, status: 'processing', lockTokenHash },
      {
        $set: {
          status: 'retry',
          nextAttemptAt: new Date('2026-07-23T14:08:00.000Z'),
          lockedUntil: null,
          lastErrorCode: 'APPLE_INVALID_GRANT',
        },
        $unset: { lockTokenHash: '' },
      }
    );
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.TaskModel.updateOne.mock.calls))
      .not.toContain(REFRESH_TOKEN);
    consoleSpy.mockRestore();
  });

  test('moves exhausted work to manual review without losing the encrypted remediation credential', async () => {
    const unboundedError = new Error(REFRESH_TOKEN);
    unboundedError.response = {
      data: { error: REFRESH_TOKEN },
    };
    const harness = makeHarness({
      claimedTasks: [makeTask({ attempts: MAX_ATTEMPTS })],
      decryptError: unboundedError,
    });

    await expect(harness.processor.processNext({ now: NOW })).resolves.toEqual({
      taskId: TASK_ID,
      status: 'manual_review',
      errorCode: 'APPLE_REVOCATION_FAILED',
    });

    expect(harness.revokeToken).not.toHaveBeenCalled();
    const failureUpdate = harness.TaskModel.updateOne.mock.calls[0][1];
    expect(failureUpdate).toEqual({
      $set: {
        status: 'manual_review',
        nextAttemptAt: null,
        lockedUntil: null,
        lastErrorCode: 'APPLE_REVOCATION_FAILED',
      },
      $unset: { lockTokenHash: '' },
    });
    expect(failureUpdate.$unset).not.toHaveProperty('refreshTokenEncrypted');
    expect(failureUpdate.$unset).not.toHaveProperty('clientId');
  });

  test('does no provider work when no task is claimable', async () => {
    const harness = makeHarness({ claimedTasks: [null] });

    await expect(harness.processor.processNext({ now: NOW })).resolves.toBeNull();
    expect(harness.decryptToken).not.toHaveBeenCalled();
    expect(harness.revokeToken).not.toHaveBeenCalled();
    expect(harness.TaskModel.updateOne).not.toHaveBeenCalled();
  });
});
