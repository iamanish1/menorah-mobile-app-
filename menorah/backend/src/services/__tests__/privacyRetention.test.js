const {
  MAX_RETENTION_BATCH_SIZE,
  createPrivacyRetentionService,
  duePayloadFilter,
  normalizeBatchSize,
} = require('../privacyRetention');

const NOW = new Date('2026-07-23T10:00:00.000Z');
const REQUEST_ID = '64f000000000000000000003';
const USER_ID = '64f000000000000000000001';

const automatedConfig = () => ({
  retentionExecutionEnabled: true,
  retentionPolicy: {
    version: 'approved-retention-v1',
    categories: {
      privacy_rights_request_payload: {
        mode: 'automated',
        retentionDays: 30,
      },
    },
  },
});

const queryResult = (value) => {
  const query = {
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => query),
    session: jest.fn(() => query),
    lean: jest.fn(async () => value),
  };
  return query;
};

describe('privacy retention execution', () => {
  test('builds a legal-hold-safe exact filter and clamps batches', () => {
    expect(duePayloadFilter(NOW, { _id: REQUEST_ID })).toEqual({
      _id: REQUEST_ID,
      status: 'completed',
      payloadEncrypted: { $type: 'string' },
      'legalHold.active': { $ne: true },
      'retention.category': 'privacy_rights_request_payload',
      'retention.policyVersion': { $type: 'string' },
      'retention.dueAt': { $type: 'date', $lte: NOW },
      'retention.payloadDisposedAt': null,
    });
    expect(normalizeBatchSize(0)).toBe(25);
    expect(normalizeBatchSize('invalid')).toBe(25);
    expect(normalizeBatchSize(1000)).toBe(MAX_RETENTION_BATCH_SIZE);
  });

  test('is disabled by default and does not query data', async () => {
    const find = jest.fn();
    const service = createPrivacyRetentionService({
      RightsRequestModel: { find },
      readConfig: () => ({
        retentionExecutionEnabled: false,
        retentionPolicy: null,
      }),
    });
    await expect(service.processBatch()).resolves.toEqual(expect.objectContaining({
      disabled: true,
      scanned: 0,
    }));
    expect(find).not.toHaveBeenCalled();
  });

  test('minimizes only the encrypted payload and appends bounded evidence', async () => {
    const candidate = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestType: 'correction',
      workflowVersion: 3,
      retention: { policyVersion: 'approved-retention-v1' },
    };
    const updateOne = jest.fn(async () => ({ modifiedCount: 1 }));
    const appendEvent = jest.fn();
    const service = createPrivacyRetentionService({
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult(candidate)),
        updateOne,
      },
      appendEvent,
      readConfig: automatedConfig,
      transactionRunner: async (work) => work(null),
    });

    await expect(service.disposeOne({
      requestId: REQUEST_ID,
      now: NOW,
    })).resolves.toEqual({
      requestId: REQUEST_ID,
      outcome: 'payload_disposed',
    });

    expect(updateOne).toHaveBeenCalledWith(
      duePayloadFilter(
        NOW,
        { _id: REQUEST_ID, workflowVersion: 3 },
        'approved-retention-v1'
      ),
      {
        $unset: { payloadEncrypted: '' },
        $set: { 'retention.payloadDisposedAt': NOW },
        $inc: { workflowVersion: 1 },
      },
      { runValidators: true }
    );
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'retention_payload_disposed',
      subjectUser: USER_ID,
      requestId: REQUEST_ID,
      policyVersion: 'approved-retention-v1',
    }));
    expect(JSON.stringify(appendEvent.mock.calls[0][0]))
      .not.toMatch(/description|payloadEncrypted/);
  });

  test('a racing legal hold or lifecycle change blocks the write and event', async () => {
    const appendEvent = jest.fn();
    const service = createPrivacyRetentionService({
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          requestType: 'grievance',
          workflowVersion: 2,
          retention: { policyVersion: 'approved-retention-v1' },
        })),
        updateOne: jest.fn(async () => ({ modifiedCount: 0 })),
      },
      appendEvent,
      readConfig: automatedConfig,
      transactionRunner: async (work) => work(null),
    });

    await expect(service.disposeOne({
      requestId: REQUEST_ID,
      now: NOW,
    })).resolves.toEqual({
      requestId: REQUEST_ID,
      outcome: 'not_due_or_protected',
    });
    expect(appendEvent).not.toHaveBeenCalled();
  });

  test('does not execute a due date created under a different policy version', async () => {
    const findOne = jest.fn(() => queryResult(null));
    const service = createPrivacyRetentionService({
      RightsRequestModel: { findOne },
      readConfig: automatedConfig,
      transactionRunner: async (work) => work(null),
    });

    await service.disposeOne({ requestId: REQUEST_ID, now: NOW });

    expect(findOne).toHaveBeenCalledWith(duePayloadFilter(
      NOW,
      { _id: REQUEST_ID },
      'approved-retention-v1'
    ));
  });

  test('processes a bounded sequential batch and reports only safe error codes', async () => {
    const ids = [
      '64f000000000000000000011',
      '64f000000000000000000012',
      '64f000000000000000000013',
    ];
    const find = jest.fn(() => queryResult(ids.map((_id) => ({ _id }))));
    const findOne = jest.fn(({ _id }) => queryResult({
      _id,
      user: USER_ID,
      requestType: 'export',
      workflowVersion: 1,
      retention: { policyVersion: 'approved-retention-v1' },
    }));
    const updateOne = jest.fn(async ({ _id }) => {
      if (_id === ids[1]) {
        const error = new Error('sensitive correction description');
        error.code = 'DATABASE_WRITE_FAILED';
        throw error;
      }
      return { modifiedCount: 1 };
    });
    const service = createPrivacyRetentionService({
      RightsRequestModel: { find, findOne, updateOne },
      appendEvent: jest.fn(),
      readConfig: automatedConfig,
      transactionRunner: async (work) => work(null),
    });

    const summary = await service.processBatch({ now: NOW, limit: 1000 });

    expect(summary).toEqual({
      disabled: false,
      scanned: 3,
      disposed: 2,
      protectedOrChanged: 0,
      failed: 1,
      failures: [{
        requestId: ids[1],
        code: 'DATABASE_WRITE_FAILED',
      }],
    });
    expect(JSON.stringify(summary)).not.toContain('sensitive correction description');
    expect(find.mock.results[0].value.limit)
      .toHaveBeenCalledWith(MAX_RETENTION_BATCH_SIZE);
  });
});
