const crypto = require('crypto');
const {
  createPayoutWebhookIdentity,
  claimPayoutWebhookEvent,
  finalizePayoutWebhookEvent,
  recordPayoutWebhookIdentityConflict,
  validatePayoutWebhookEntity,
} = require('../payoutWebhookReconciliation');

const rawBody = Buffer.from('{"event":"payout.processed"}');
const now = new Date('2026-07-23T10:00:00.000Z');

const buildPayout = (overrides = {}) => ({
  _id: '64b000000000000000000001',
  amountPaise: 125000,
  referenceId: 'menorah_payout_request_123',
  razorpayFundAccountId: 'fa_1234567890',
  counsellor: { _id: '64b000000000000000000002' },
  ...overrides,
});

const buildEvent = (overrides = {}) => ({
  entity: 'event',
  event: 'payout.processed',
  contains: ['payout'],
  ...overrides,
});

const buildEntity = (overrides = {}) => ({
  id: 'pout_1234567890',
  entity: 'payout',
  amount: 125000,
  currency: 'INR',
  status: 'processed',
  purpose: 'payout',
  reference_id: 'menorah_payout_request_123',
  fund_account_id: 'fa_1234567890',
  notes: { counsellorId: '64b000000000000000000002' },
  ...overrides,
});

const queryResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

describe('payout webhook reconciliation', () => {
  test('uses the exact signed bytes as the authoritative replay digest', () => {
    const identity = createPayoutWebhookIdentity({
      rawBody,
      providerEventId: ' evt_123456 ',
    });
    expect(identity).toEqual({
      eventKey: 'razorpay-x:evt_123456',
      providerEventId: 'evt_123456',
      payloadDigest: crypto.createHash('sha256').update(rawBody).digest('hex'),
    });
    expect(() => createPayoutWebhookIdentity({ rawBody: Buffer.alloc(0) }))
      .toThrow('rawBody must be a non-empty Buffer');
  });

  test('accepts only an exact payout entity association', () => {
    expect(validatePayoutWebhookEntity({
      event: buildEvent(),
      payoutData: buildEntity(),
      payoutRecord: buildPayout(),
    })).toEqual({ valid: true, mismatchCodes: [] });
  });

  test.each([
    ['amount', { amount: 1 }, 'PAYOUT_AMOUNT_MISMATCH'],
    ['currency', { currency: 'USD' }, 'PAYOUT_CURRENCY_MISMATCH'],
    ['reference', { reference_id: 'other' }, 'PAYOUT_REFERENCE_MISMATCH'],
    ['fund account', { fund_account_id: 'fa_other' }, 'PAYOUT_FUND_ACCOUNT_MISMATCH'],
    ['purpose', { purpose: 'refund' }, 'PAYOUT_PURPOSE_MISMATCH'],
    ['counsellor', { notes: { counsellorId: 'other' } }, 'PAYOUT_COUNSELLOR_MISMATCH'],
  ])('detects a %s mismatch', (_label, entityOverride, expectedCode) => {
    const result = validatePayoutWebhookEntity({
      event: buildEvent(),
      payoutData: buildEntity(entityOverride),
      payoutRecord: buildPayout(),
    });
    expect(result.valid).toBe(false);
    expect(result.mismatchCodes).toContain(expectedCode);
  });

  test('detects event/status and structural mismatches', () => {
    const result = validatePayoutWebhookEntity({
      event: buildEvent({
        entity: 'not-event',
        event: 'payout.failed',
        contains: [],
      }),
      payoutData: buildEntity({ entity: 'not-payout', status: 'processed' }),
      payoutRecord: buildPayout(),
    });
    expect(result.mismatchCodes).toEqual(expect.arrayContaining([
      'EVENT_ENTITY_MISMATCH',
      'EVENT_CONTAINS_MISMATCH',
      'PAYOUT_ENTITY_MISMATCH',
      'EVENT_STATUS_MISMATCH',
    ]));
  });

  test('claims a new event without persisting a null provider event id', async () => {
    const created = { _id: 'ledger-1', processingState: 'processing' };
    const Model = {
      create: jest.fn().mockResolvedValue(created),
    };
    const claim = await claimPayoutWebhookEvent({
      rawBody,
      eventType: 'payout.processed',
      providerPayoutId: 'pout_1234567890',
      PayoutWebhookEventModel: Model,
      now,
    });
    expect(claim).toMatchObject({ claimed: true, duplicate: false, conflict: false });
    expect(Model.create).toHaveBeenCalledWith(expect.not.objectContaining({
      providerEventId: expect.anything(),
    }));
  });

  test('acknowledges a finalized exact replay and increments delivery evidence', async () => {
    const digest = createPayoutWebhookIdentity({ rawBody }).payloadDigest;
    const existing = {
      _id: 'ledger-1',
      eventKey: `razorpay-x:${digest}`,
      payloadDigest: digest,
      processingState: 'processed',
    };
    const Model = {
      create: jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
      findOne: jest.fn().mockReturnValue(queryResult(existing)),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const claim = await claimPayoutWebhookEvent({
      rawBody,
      eventType: 'payout.processed',
      PayoutWebhookEventModel: Model,
      now,
    });
    expect(claim).toMatchObject({ claimed: false, duplicate: true, conflict: false });
    expect(Model.updateOne).toHaveBeenCalledWith(
      { _id: 'ledger-1', payloadDigest: digest },
      {
        $inc: { deliveryCount: 1 },
        $set: { lastDeliveryAt: now },
      }
    );
  });

  test('treats the same signed payload as a replay even if its header changes', async () => {
    const digest = createPayoutWebhookIdentity({ rawBody }).payloadDigest;
    const Model = {
      create: jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
      findOne: jest.fn().mockReturnValue(queryResult({
        _id: 'ledger-1',
        providerEventId: 'evt_original',
        payloadDigest: digest,
        processingState: 'processed',
      })),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const claim = await claimPayoutWebhookEvent({
      rawBody,
      providerEventId: 'evt_changed',
      eventType: 'payout.processed',
      PayoutWebhookEventModel: Model,
    });
    expect(claim).toMatchObject({ duplicate: true, conflict: false });
  });

  test('flags reuse of a provider event id for different signed bytes', async () => {
    const Model = {
      create: jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
      findOne: jest.fn().mockReturnValue(queryResult({
        _id: 'ledger-1',
        providerEventId: 'evt_reused',
        payloadDigest: 'f'.repeat(64),
        processingState: 'processed',
      })),
    };
    const claim = await claimPayoutWebhookEvent({
      rawBody,
      providerEventId: 'evt_reused',
      eventType: 'payout.processed',
      PayoutWebhookEventModel: Model,
    });
    expect(claim).toMatchObject({ claimed: false, duplicate: false, conflict: true });
  });

  test('finalizes only the matching ledger identity with bounded evidence', async () => {
    const Model = { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) };
    await finalizePayoutWebhookEvent({
      eventId: 'ledger-1',
      payloadDigest: 'a'.repeat(64),
      processingState: 'needs_review',
      reconciliationDecision: 'needs_review',
      mismatchCodes: ['PAYOUT_AMOUNT_MISMATCH', 'PAYOUT_AMOUNT_MISMATCH'],
      providerPayoutId: 'pout_1234567890',
      payoutId: '64b000000000000000000001',
      PayoutWebhookEventModel: Model,
      now,
    });
    expect(Model.updateOne).toHaveBeenCalledWith(
      { _id: 'ledger-1', payloadDigest: 'a'.repeat(64) },
      { $set: expect.objectContaining({
        processingState: 'needs_review',
        mismatchCodes: ['PAYOUT_AMOUNT_MISMATCH'],
        processedAt: now,
      }) }
    );
  });

  test('records an identity conflict without storing the conflicting payload', async () => {
    const Model = { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) };
    await recordPayoutWebhookIdentityConflict({
      eventId: 'ledger-1',
      PayoutWebhookEventModel: Model,
      now,
    });
    expect(Model.updateOne).toHaveBeenCalledWith(
      { _id: 'ledger-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          mismatchCodes: ['PAYOUT_WEBHOOK_IDENTITY_CONFLICT'],
        }),
        $inc: { identityConflictCount: 1, deliveryCount: 1 },
      })
    );
  });
});
