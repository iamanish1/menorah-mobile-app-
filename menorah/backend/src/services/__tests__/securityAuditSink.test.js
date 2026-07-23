const crypto = require('crypto');
const {
  configureSecurityAuditSinkForTests,
  createAuditAppendMutation,
  createSecurityAuditAppender,
  drainSecurityAuditSink,
  enqueueSecurityAuditEntry,
  getSecurityAuditSinkSnapshot,
  resetSecurityAuditSinkForTests,
  runMongoAuditTransaction,
  sanitizeDurableEntry,
  verifyDurableSecurityAuditChain,
} = require('../securityAuditSink');
const {
  recordSecurityEvent,
  resetSecurityMetricsForTests,
} = require('../../utils/securityAudit');

const SIGNING_KEY = 'test-only-durable-security-audit-signing-key-v1';

const buildEntry = (event, overrides = {}) => ({
  eventId: crypto.randomUUID(),
  timestamp: new Date('2026-07-23T12:00:00.000Z').toISOString(),
  category: 'security',
  event,
  outcome: 'success',
  service: 'api-web',
  method: 'post',
  path: '/api/users/profile',
  actorRole: 'user',
  ...overrides,
});

const createMemoryLedger = () => {
  const ledger = {
    checkpoint: null,
    events: [],
  };
  let transactionTail = Promise.resolve();

  const transact = (entry, { signingKey, now }) => {
    const operation = transactionTail.then(async () => {
      const mutation = createAuditAppendMutation({
        entry,
        checkpoint: ledger.checkpoint,
        signingKey,
        persistedAt: now(),
      });
      ledger.events.push(mutation.event);
      ledger.checkpoint = mutation.checkpoint;
      return mutation.event;
    });
    transactionTail = operation.catch(() => {});
    return operation;
  };

  return { ledger, transact };
};

const createMongoHarness = () => {
  const stored = {
    checkpoint: null,
    events: [],
  };
  const eventsCollection = {
    findOne: jest.fn(async ({ eventId }) => (
      stored.events.find((event) => event.eventId === eventId) || null
    )),
    insertOne: jest.fn(async (event) => {
      stored.events.push({ ...event });
      return { acknowledged: true };
    }),
  };
  const checkpointsCollection = {
    findOne: jest.fn(async ({ scope }) => (
      stored.checkpoint?.scope === scope ? { ...stored.checkpoint } : null
    )),
    insertOne: jest.fn(async (checkpoint) => {
      stored.checkpoint = { _id: 'checkpoint-id', ...checkpoint };
      return { acknowledged: true };
    }),
    updateOne: jest.fn(async (filter, { $set }) => {
      if (
        stored.checkpoint?._id !== filter._id
        || stored.checkpoint.sequence !== filter.sequence
        || stored.checkpoint.checkpointHash !== filter.checkpointHash
      ) {
        return { modifiedCount: 0 };
      }
      stored.checkpoint = { ...stored.checkpoint, ...$set };
      return { modifiedCount: 1 };
    }),
  };
  const session = {
    withTransaction: jest.fn(async (operation) => operation()),
    endSession: jest.fn(async () => {}),
  };
  const mongooseInstance = {
    connection: {
      readyState: 1,
      db: {
        collection: jest.fn((name) => (
          name === 'securityauditevents'
            ? eventsCollection
            : checkpointsCollection
        )),
      },
    },
    startSession: jest.fn(async () => session),
  };
  return {
    checkpointsCollection,
    eventsCollection,
    mongooseInstance,
    session,
    stored,
  };
};

describe('durable security audit sink', () => {
  const originalEnv = process.env;
  let errorSpy;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SERVICE_NAME: 'api-web',
      AUDIT_LOG_SIGNING_KEY: SIGNING_KEY,
      SECURITY_AUDIT_DURABLE_TEST_OUTPUT: 'true',
    };
    resetSecurityMetricsForTests();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    resetSecurityAuditSinkForTests();
    errorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('serializes concurrent writers into one contiguous durable chain', async () => {
    const { ledger, transact } = createMemoryLedger();
    const appenderA = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });
    const appenderB = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });

    await Promise.all(Array.from({ length: 24 }, (_, index) => (
      (index % 2 === 0 ? appenderA : appenderB)(buildEntry(`event_${index}`))
    )));

    expect(ledger.events.map(({ sequence }) => sequence))
      .toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    expect(verifyDurableSecurityAuditChain(
      ledger.events,
      ledger.checkpoint,
      { signingKey: SIGNING_KEY }
    )).toEqual(expect.objectContaining({
      valid: true,
      scope: 'api-web',
      sequence: 24,
    }));
  });

  test('a fresh appender resumes from the signed durable checkpoint after restart', async () => {
    const { ledger, transact } = createMemoryLedger();
    const firstProcessAppender = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });
    await firstProcessAppender(buildEntry('before_restart'));
    const firstHead = ledger.checkpoint.headIntegrityHash;

    const restartedProcessAppender = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });
    await restartedProcessAppender(buildEntry('after_restart'));

    expect(ledger.events[1]).toEqual(expect.objectContaining({
      sequence: 2,
      previousIntegrityHash: firstHead,
    }));
    expect(verifyDurableSecurityAuditChain(
      ledger.events,
      ledger.checkpoint,
      { signingKey: SIGNING_KEY }
    ).valid).toBe(true);
  });

  test('uses one MongoDB transaction for the event and signed checkpoint advance', async () => {
    const harness = createMongoHarness();
    const entry = buildEntry('transactional_event');

    const persisted = await runMongoAuditTransaction(entry, {
      mongooseInstance: harness.mongooseInstance,
      signingKey: SIGNING_KEY,
      now: () => new Date('2026-07-23T12:01:00.000Z'),
    });

    expect(persisted.sequence).toBe(1);
    expect(harness.eventsCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: entry.eventId, sequence: 1 }),
      { session: harness.session }
    );
    expect(harness.checkpointsCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'api-web',
        sequence: 1,
        headIntegrityHash: persisted.integrityHash,
      }),
      { session: harness.session }
    );
    expect(harness.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      })
    );
    expect(harness.session.endSession).toHaveBeenCalledTimes(1);

    const replayed = await runMongoAuditTransaction(entry, {
      mongooseInstance: harness.mongooseInstance,
      signingKey: SIGNING_KEY,
    });
    expect(replayed.eventId).toBe(entry.eventId);
    expect(harness.mongooseInstance.startSession).toHaveBeenCalledTimes(1);
    expect(harness.stored.events).toHaveLength(1);
  });

  test('detects event edits, deletion, checkpoint rewinds, and reordered entries', async () => {
    const { ledger, transact } = createMemoryLedger();
    const appender = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });
    await appender(buildEntry('first_event'));
    await appender(buildEntry('second_event'));

    expect(verifyDurableSecurityAuditChain(
      [{ ...ledger.events[0], outcome: 'failure' }, ledger.events[1]],
      ledger.checkpoint,
      { signingKey: SIGNING_KEY }
    )).toEqual(expect.objectContaining({
      valid: false,
      index: 0,
      reason: 'integrity_hash_mismatch',
    }));
    expect(verifyDurableSecurityAuditChain(
      [ledger.events[1]],
      ledger.checkpoint,
      { signingKey: SIGNING_KEY }
    ).reason).toBe('sequence_count_mismatch');
    expect(verifyDurableSecurityAuditChain(
      [...ledger.events].reverse(),
      ledger.checkpoint,
      { signingKey: SIGNING_KEY }
    ).reason).toBe('sequence_mismatch');
    expect(verifyDurableSecurityAuditChain(
      ledger.events,
      { ...ledger.checkpoint, sequence: 1 },
      { signingKey: SIGNING_KEY }
    ).reason).toBe('checkpoint_hash_mismatch');
  });

  test('refuses to extend a tampered checkpoint instead of replacing the evidence', async () => {
    const { ledger, transact } = createMemoryLedger();
    const appender = createSecurityAuditAppender({
      transact,
      signingKeyProvider: () => SIGNING_KEY,
    });
    await appender(buildEntry('trusted_event'));
    const trustedEvents = [...ledger.events];
    ledger.checkpoint = {
      ...ledger.checkpoint,
      headIntegrityHash: '0'.repeat(64),
    };

    await expect(appender(buildEntry('must_not_append'))).rejects.toMatchObject({
      code: 'SECURITY_AUDIT_CHECKPOINT_INVALID',
    });
    expect(ledger.events).toEqual(trustedEvents);
  });

  test('keeps request-path logging available, retains failed writes, then drains on recovery', async () => {
    const appender = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('simulated database outage'), {
        code: 'SECURITY_AUDIT_DATABASE_UNAVAILABLE',
      }))
      .mockResolvedValueOnce({});
    configureSecurityAuditSinkForTests({ appender, autoDrain: false });

    expect(() => recordSecurityEvent('request_during_sink_outage', {
      req: { method: 'POST', originalUrl: '/api/users/profile' },
    })).not.toThrow();
    expect(getSecurityAuditSinkSnapshot().pending).toBe(1);

    await drainSecurityAuditSink({ scheduleRetry: false });
    expect(getSecurityAuditSinkSnapshot()).toEqual(expect.objectContaining({
      pending: 1,
      failureCounts: expect.objectContaining({ database_unavailable: 1 }),
    }));

    await drainSecurityAuditSink({ scheduleRetry: false });
    expect(getSecurityAuditSinkSnapshot()).toEqual(expect.objectContaining({
      pending: 0,
      persisted: 1,
    }));
  });

  test('bounds the unavailable-sink queue and reports overflow without leaking entries', () => {
    process.env.SECURITY_AUDIT_PENDING_MAX = '128';
    configureSecurityAuditSinkForTests({ appender: jest.fn(), autoDrain: false });

    for (let index = 0; index < 129; index += 1) {
      enqueueSecurityAuditEntry(buildEntry(`bounded_${index}`));
    }

    expect(getSecurityAuditSinkSnapshot()).toEqual(expect.objectContaining({
      pending: 128,
      failureCounts: expect.objectContaining({ queue_overflow: 1 }),
    }));
    expect(errorSpy).toHaveBeenCalledWith(expect.not.stringContaining('bounded_128'));
  });

  test('re-whitelists durable fields so arbitrary caller secrets cannot reach MongoDB', () => {
    const sanitized = sanitizeDurableEntry(buildEntry('secret_probe', {
      actorId: '64f000000000000000000021',
      permission: 'finance_read',
      operationalRole: 'support',
      password: 'do-not-persist',
      authorization: 'Bearer do-not-persist',
      details: { token: 'do-not-persist' },
    }));

    expect(sanitized.actorId).toBe('64f000000000000000000021');
    expect(sanitized.permission).toBe('finance_read');
    expect(sanitized.operationalRole).toBe('support');
    expect(JSON.stringify(sanitized)).not.toContain('do-not-persist');
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).not.toHaveProperty('authorization');
    expect(sanitized).not.toHaveProperty('details');
  });
});
