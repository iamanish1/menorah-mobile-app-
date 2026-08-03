const {
  createShutdownHandler,
  drainAuditBeforeDatabaseClose,
} = require('../gracefulShutdown');

describe('security-audit-aware graceful shutdown', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const createHarness = ({
    drainAudit = jest.fn(async () => {}),
    getAuditSnapshot = jest.fn(() => ({ pending: 0 })),
    auditDrainTimeoutMs = 100,
  } = {}) => {
    const order = [];
    const server = {
      close: jest.fn((callback) => {
        order.push('server');
        callback();
      }),
    };
    const mongooseConnection = {
      close: jest.fn(async () => {
        order.push('mongo');
      }),
    };
    const closeRedisClients = jest.fn(async () => {
      order.push('redis');
    });
    const exitProcess = jest.fn((code) => {
      order.push(`exit:${code}`);
    });
    const wrappedDrain = jest.fn(async (options) => {
      order.push('audit');
      return drainAudit(options);
    });
    const shutdown = createShutdownHandler({
      server,
      serviceName: 'api-web',
      mongooseConnection,
      closeRedisClients,
      drainAudit: wrappedDrain,
      getAuditSnapshot,
      exitProcess,
      auditDrainTimeoutMs,
      forceExitTimeoutMs: 1000,
    });
    return {
      closeRedisClients,
      exitProcess,
      getAuditSnapshot,
      mongooseConnection,
      order,
      server,
      shutdown,
      wrappedDrain,
    };
  };

  test('drains the audit queue after requests stop and before MongoDB closes', async () => {
    const harness = createHarness();

    await expect(harness.shutdown('SIGTERM')).resolves.toBe(true);

    expect(harness.wrappedDrain).toHaveBeenCalledWith({ scheduleRetry: false });
    expect(harness.order).toEqual([
      'server',
      'audit',
      'mongo',
      'redis',
      'exit:0',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('exits nonzero when a completed drain still has pending evidence', async () => {
    const harness = createHarness({
      getAuditSnapshot: jest.fn(() => ({ pending: 3 })),
    });

    await expect(harness.shutdown('SIGINT')).resolves.toBe(false);

    expect(harness.order).toEqual([
      'server',
      'audit',
      'mongo',
      'redis',
      'exit:1',
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[security-audit] shutdown drain incomplete; refusing a successful process exit'
    );
  });

  test('bounds a stalled drain, closes resources, and refuses exit zero', async () => {
    const neverSettles = new Promise(() => {});
    const harness = createHarness({
      drainAudit: jest.fn(() => neverSettles),
      getAuditSnapshot: jest.fn(() => ({ pending: 1 })),
      auditDrainTimeoutMs: 5,
    });

    await expect(harness.shutdown('SIGTERM')).resolves.toBe(false);

    expect(harness.order).toEqual([
      'server',
      'audit',
      'mongo',
      'redis',
      'exit:1',
    ]);
    expect(harness.exitProcess).toHaveBeenLastCalledWith(1);
  });

  test('treats a drain rejection as incomplete without exposing its error', async () => {
    const sensitiveError = new Error('mongodb://user:secret@database');
    const harness = createHarness({
      drainAudit: jest.fn(async () => {
        throw sensitiveError;
      }),
      getAuditSnapshot: jest.fn(() => ({ pending: 1 })),
    });

    await expect(harness.shutdown('SIGTERM')).resolves.toBe(false);

    expect(harness.exitProcess).toHaveBeenCalledWith(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('mongodb://');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret');
  });

  test('coalesces repeated signals into the in-progress shutdown', async () => {
    let closeCallback;
    const server = {
      close: jest.fn((callback) => {
        closeCallback = callback;
      }),
    };
    const exitProcess = jest.fn();
    const shutdown = createShutdownHandler({
      server,
      serviceName: 'api-web',
      mongooseConnection: { close: jest.fn(async () => {}) },
      closeRedisClients: jest.fn(async () => {}),
      drainAudit: jest.fn(async () => {}),
      getAuditSnapshot: jest.fn(() => ({ pending: 0 })),
      exitProcess,
    });

    const first = shutdown('SIGTERM');
    await expect(shutdown('SIGINT')).resolves.toBe(false);
    expect(server.close).toHaveBeenCalledTimes(1);

    await closeCallback();
    await expect(first).resolves.toBe(true);
    expect(exitProcess).toHaveBeenCalledTimes(1);
  });

  test('the bounded drain helper reports a rejection as undrained', async () => {
    const result = await drainAuditBeforeDatabaseClose({
      drainAudit: jest.fn(async () => {
        throw new Error('unavailable');
      }),
      getAuditSnapshot: jest.fn(() => ({ pending: 2 })),
      timeoutMs: 100,
    });

    expect(result).toEqual({ drained: false, pending: 2 });
  });
});
