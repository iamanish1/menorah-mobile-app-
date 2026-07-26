const {
  recordCallMediaOutcome,
  recordCallProviderOperation,
  recordEmailDelivery,
  recordEmailDispatch,
  recordPaymentOperation,
  recordPaymentWebhook,
  recordQueueJobOutcome,
  recordWorkerHeartbeat,
  renderReliabilityMetrics,
  resetReliabilityMetricsForTests,
  setQueueSnapshot,
} = require('../reliabilityMetrics');
const {
  collectProviderRevocationQueueMetrics,
} = require('../../services/providerRevocationService');

describe('bounded reliability metrics', () => {
  beforeEach(() => {
    process.env.SERVICE_NAME = 'worker';
    resetReliabilityMetricsForTests();
  });

  test('exports the durable queue backlog, age, retries, dead letters, failures, and heartbeat', () => {
    setQueueSnapshot({
      queue: 'provider_revocation',
      pending: 7,
      oldestPendingAgeSeconds: 901,
      retryBacklog: 3,
      deadLetter: 1,
    });
    recordQueueJobOutcome({ queue: 'provider_revocation', outcome: 'failure' });
    recordWorkerHeartbeat({
      worker: 'provider_revocation',
      timestampSeconds: 1_700_000_000,
    });

    const metrics = renderReliabilityMetrics();
    expect(metrics).toContain(
      'menorah_queue_pending_jobs{service="worker",queue="provider_revocation"} 7'
    );
    expect(metrics).toContain(
      'menorah_queue_oldest_pending_age_seconds{service="worker",queue="provider_revocation"} 901'
    );
    expect(metrics).toContain(
      'menorah_queue_retry_backlog{service="worker",queue="provider_revocation"} 3'
    );
    expect(metrics).toContain(
      'menorah_queue_dead_letter_jobs{service="worker",queue="provider_revocation"} 1'
    );
    expect(metrics).toContain(
      'menorah_queue_jobs_total{service="worker",queue="provider_revocation",outcome="failure"} 1'
    );
    expect(metrics).toContain(
      'menorah_worker_heartbeat_timestamp_seconds{service="worker",queue="provider_revocation"} 1700000000'
    );
  });

  test('collects a snapshot from the real durable provider-revocation model contract', async () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const TaskModel = {
      countDocuments: jest.fn(({ status }) => Promise.resolve({
        pending: 4,
        retry: 2,
        manual_review: 1,
      }[status])),
      findOne: jest.fn(() => ({
        sort: () => ({
          select: () => ({
            lean: () => Promise.resolve({
              createdAt: new Date('2026-07-24T11:45:00.000Z'),
            }),
          }),
        }),
      })),
    };

    await collectProviderRevocationQueueMetrics({ TaskModel, now });
    const metrics = renderReliabilityMetrics();
    expect(metrics).toContain('queue="provider_revocation"} 4');
    expect(metrics).toContain('queue="provider_revocation"} 900');
    expect(metrics).toContain('queue="provider_revocation"} 2');
    expect(metrics).toContain('queue="provider_revocation"} 1');
  });

  test('emits provider outcomes without identifiers, recipients, payloads, or raw reasons', () => {
    process.env.SERVICE_NAME = 'api-web';
    recordPaymentOperation({
      provider: 'razorpay',
      operation: 'payment_verify',
      outcome: 'failure',
    });
    recordPaymentWebhook({
      provider: 'razorpay',
      event: 'relationship',
      outcome: 'failure',
    });
    recordEmailDispatch({ provider: 'resend', outcome: 'failure' });
    recordEmailDelivery({ provider: 'resend', outcome: 'bounced' });
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'connect',
      outcome: 'failure',
    });
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'connect',
      outcome: 'disabled',
    });
    recordCallMediaOutcome({
      provider: 'livekit',
      media: 'video',
      outcome: 'failure',
    });

    const metrics = renderReliabilityMetrics();
    expect(metrics).toContain('operation="payment_verify",outcome="failure"} 1');
    expect(metrics).toContain('event="relationship",outcome="failure"} 1');
    expect(metrics).toContain('provider="resend",outcome="bounced"} 1');
    expect(metrics).toContain('operation="connect",outcome="failure"} 1');
    expect(metrics).toContain('operation="connect",outcome="disabled"} 1');
    expect(metrics).toContain('media="video",outcome="failure"} 1');
    for (const forbidden of [
      'payment_id',
      'booking_id',
      'recipient',
      'email@example.com',
      'payload',
      'reason',
    ]) {
      expect(metrics).not.toContain(forbidden);
    }
  });

  test('rejects every unbounded label at the producer boundary', () => {
    expect(() => recordPaymentOperation({
      provider: 'attacker@example.com',
      operation: 'payment_verify',
      outcome: 'failure',
    })).toThrow('Unsupported payment provider');
    expect(() => recordEmailDelivery({
      provider: 'resend',
      outcome: 'recipient@example.com',
    })).toThrow('Unsupported email delivery outcome');
    expect(() => recordCallMediaOutcome({
      provider: 'livekit',
      media: 'booking-507f1f77bcf86cd799439011',
      outcome: 'failure',
    })).toThrow('Unsupported call media');
  });
});
