const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockPayoutFindOne = jest.fn();
const mockPayoutFindOneAndUpdate = jest.fn();
const mockPayoutFindById = jest.fn();
const mockPayoutUpdateOne = jest.fn();
const mockPayoutAggregate = jest.fn();
const mockCounsellorFindByIdAndUpdate = jest.fn();
const mockClaimPayoutWebhookEvent = jest.fn();
const mockFinalizePayoutWebhookEvent = jest.fn();
const mockRecordPayoutWebhookIdentityConflict = jest.fn();
const mockRecordSecurityEvent = jest.fn();

jest.mock('../../models/Payout', () => ({
  findOne: (...args) => mockPayoutFindOne(...args),
  findOneAndUpdate: (...args) => mockPayoutFindOneAndUpdate(...args),
  findById: (...args) => mockPayoutFindById(...args),
  updateOne: (...args) => mockPayoutUpdateOne(...args),
  aggregate: (...args) => mockPayoutAggregate(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findByIdAndUpdate: (...args) => mockCounsellorFindByIdAndUpdate(...args),
}));

jest.mock('../../services/payoutWebhookReconciliation', () => ({
  ...jest.requireActual('../../services/payoutWebhookReconciliation'),
  claimPayoutWebhookEvent: (...args) => mockClaimPayoutWebhookEvent(...args),
  finalizePayoutWebhookEvent: (...args) => mockFinalizePayoutWebhookEvent(...args),
  recordPayoutWebhookIdentityConflict: (...args) => (
    mockRecordPayoutWebhookIdentityConflict(...args)
  ),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

const payoutWebhookRouter = require('../payout-webhook');

const webhookSecret = 'X-Webhook-A1b2C3d4E5f6G7h8';
const payoutId = '64b000000000000000000001';
const counsellorId = '64b000000000000000000002';

const buildPayload = (entityOverrides = {}, eventOverrides = {}) => ({
  entity: 'event',
  event: 'payout.processed',
  contains: ['payout'],
  payload: {
    payout: {
      entity: {
        id: 'pout_1234567890',
        entity: 'payout',
        fund_account_id: 'fa_1234567890',
        amount: 125000,
        currency: 'INR',
        status: 'processed',
        purpose: 'payout',
        reference_id: 'menorah_payout_request_123',
        notes: { counsellorId },
        utr: 'UTR_TEST_123',
        failure_reason: null,
        ...entityOverrides,
      },
    },
  },
  ...eventOverrides,
});

const storedPayout = (overrides = {}) => ({
  _id: payoutId,
  amountPaise: 125000,
  amountRupees: 1250,
  referenceId: 'menorah_payout_request_123',
  razorpayPayoutId: 'pout_1234567890',
  razorpayFundAccountId: 'fa_1234567890',
  status: 'processing',
  counsellor: {
    _id: counsellorId,
    user: { firstName: 'Test', phone: '+910000000000' },
  },
  ...overrides,
});

const populatedQuery = (value) => ({ populate: jest.fn().mockResolvedValue(value) });
const leanQuery = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

const buildApp = () => {
  const app = express();
  app.use('/api/payouts/webhook', express.raw({ type: 'application/json' }));
  app.use('/api/payouts/webhook', payoutWebhookRouter);
  return app;
};

const deliver = (payload) => {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
  return request(buildApp())
    .post('/api/payouts/webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature)
    .set('x-razorpay-event-id', 'evt_payout_123')
    .send(raw);
};

describe('payout webhook durable reconciliation route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_X_WEBHOOK_SECRET = webhookSecret;

    mockClaimPayoutWebhookEvent.mockImplementation(async ({ rawBody }) => ({
      event: { _id: 'ledger-1' },
      identity: {
        providerEventId: 'evt_payout_123',
        payloadDigest: crypto.createHash('sha256').update(rawBody).digest('hex'),
      },
      claimed: true,
      duplicate: false,
      conflict: false,
    }));
    mockFinalizePayoutWebhookEvent.mockResolvedValue(undefined);
    mockPayoutUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockPayoutAggregate.mockResolvedValue([{
      totalPaidOut: 1250,
      lastPayoutAt: new Date('2026-07-23T10:00:00.000Z'),
      lastPayoutAmount: 1250,
    }]);
    mockCounsellorFindByIdAndUpdate.mockResolvedValue({});
  });

  afterAll(() => {
    delete process.env.RAZORPAY_X_WEBHOOK_SECRET;
  });

  test('applies a fully associated event and finalizes its ledger record', async () => {
    const payout = storedPayout();
    mockPayoutFindOne.mockReturnValue(populatedQuery(payout));
    mockPayoutFindOneAndUpdate.mockReturnValue(populatedQuery(payout));

    const response = await deliver(buildPayload()).expect(200);
    expect(response.body).toEqual({ success: true });
    expect(mockPayoutFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        razorpayPayoutId: 'pout_1234567890',
        amountPaise: 125000,
        referenceId: 'menorah_payout_request_123',
        razorpayFundAccountId: 'fa_1234567890',
        counsellor: counsellorId,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'processed',
          reconciliationStatus: 'matched',
          reconciliationMismatchCodes: [],
        }),
      }),
      { new: true }
    );
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingState: 'processed',
      reconciliationDecision: 'apply',
      payoutId,
    }));
  });

  test('quarantines amount mismatch without changing payout status', async () => {
    mockPayoutFindOne.mockReturnValue(populatedQuery(storedPayout()));

    const response = await deliver(buildPayload({ amount: 1 })).expect(200);
    expect(response.body).toEqual({ success: true, reviewRequired: true });
    expect(mockPayoutFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockPayoutUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: payoutId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          reconciliationStatus: 'needs_review',
          reconciliationMismatchCodes: expect.arrayContaining([
            'PAYOUT_AMOUNT_MISMATCH',
          ]),
        }),
      })
    );
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingState: 'needs_review',
      mismatchCodes: expect.arrayContaining(['PAYOUT_AMOUNT_MISMATCH']),
    }));
  });

  test('acknowledges a finalized replay before touching payout state', async () => {
    mockClaimPayoutWebhookEvent.mockResolvedValue({
      event: { _id: 'ledger-1' },
      identity: { providerEventId: 'evt_payout_123', payloadDigest: 'a'.repeat(64) },
      claimed: false,
      duplicate: true,
      conflict: false,
    });

    const response = await deliver(buildPayload()).expect(200);
    expect(response.body).toEqual({ success: true, duplicate: true });
    expect(mockPayoutFindOne).not.toHaveBeenCalled();
    expect(mockPayoutFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('ignores a stale non-terminal event after a terminal state', async () => {
    const payload = buildPayload(
      { status: 'queued' },
      { event: 'payout.queued' }
    );
    mockPayoutFindOne.mockReturnValue(populatedQuery(storedPayout({ status: 'processed' })));
    mockPayoutFindOneAndUpdate.mockReturnValue(populatedQuery(null));
    mockPayoutFindById.mockReturnValue(leanQuery({ status: 'processed' }));

    const response = await deliver(payload).expect(200);
    expect(response.body).toEqual({ success: true, ignored: true });
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingState: 'ignored',
      mismatchCodes: ['OUT_OF_ORDER_PAYOUT_STATUS'],
    }));
  });

  test('repairs derived counters when a prior delivery committed before ledger finalization', async () => {
    const payload = buildPayload();
    const raw = JSON.stringify(payload);
    const payloadDigest = crypto.createHash('sha256').update(raw).digest('hex');
    mockClaimPayoutWebhookEvent.mockResolvedValue({
      event: { _id: 'ledger-1', processingState: 'processing' },
      identity: { providerEventId: 'evt_payout_123', payloadDigest },
      claimed: true,
      duplicate: true,
      conflict: false,
    });
    mockPayoutFindOne.mockReturnValue(populatedQuery(storedPayout({ status: 'processed' })));
    mockPayoutFindOneAndUpdate.mockReturnValue(populatedQuery(null));
    mockPayoutFindById.mockReturnValue(leanQuery({
      status: 'processed',
      lastWebhookPayloadDigest: payloadDigest,
    }));

    const response = await deliver(payload).expect(200);
    expect(response.body).toEqual({ success: true, duplicate: true });
    expect(mockPayoutAggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { counsellor: counsellorId, status: 'processed' } },
    ]));
    expect(mockCounsellorFindByIdAndUpdate).toHaveBeenCalledWith(
      counsellorId,
      expect.objectContaining({ $set: expect.any(Object) })
    );
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      reconciliationDecision: 'already_applied',
    }));
  });

  test('records a provider event identity conflict for manual review', async () => {
    mockClaimPayoutWebhookEvent.mockResolvedValue({
      event: { _id: 'ledger-1' },
      identity: { providerEventId: 'evt_payout_123', payloadDigest: 'a'.repeat(64) },
      claimed: false,
      duplicate: false,
      conflict: true,
    });
    mockRecordPayoutWebhookIdentityConflict.mockResolvedValue(undefined);

    const response = await deliver(buildPayload()).expect(200);
    expect(response.body).toEqual({ success: true, reviewRequired: true });
    expect(mockRecordPayoutWebhookIdentityConflict).toHaveBeenCalledWith({
      eventId: 'ledger-1',
    });
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'payout_webhook_identity_conflict',
      expect.any(Object)
    );
  });

  test('leaves a retryable ledger state and returns 503 on database failure', async () => {
    mockPayoutFindOne.mockReturnValue({
      populate: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });

    await deliver(buildPayload()).expect(503);
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      processingState: 'retryable_failure',
      failureCode: 'PAYOUT_WEBHOOK_PROCESSING_FAILED',
    }));
  });
});
