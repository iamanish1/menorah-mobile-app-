const {
  buildPayoutIssueFilter,
  buildPayoutReconciliationReport,
  pageRows,
} = require('../payoutReconciliationReport');

const NOW = new Date('2026-07-23T12:00:00.000Z');

const queryReturning = (rows) => {
  const query = {};
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.lean = jest.fn(async () => rows);
  return query;
};

describe('payout reconciliation read-only report', () => {
  test('returns bounded operational evidence without webhook bodies or bank data', async () => {
    const eventQuery = queryReturning([{
      _id: '64f000000000000000000001',
      eventType: 'payout.processed',
      providerPayoutId: 'pout_safe_123',
      payout: '64f000000000000000000002',
      processingState: 'needs_review',
      mismatchCodes: ['PAYOUT_AMOUNT_MISMATCH'],
      deliveryCount: 2,
      receivedAt: new Date('2026-07-23T11:00:00.000Z'),
      payloadDigest: 'must-not-be-reported',
      providerEventId: 'must-not-be-reported',
    }]);
    const payoutQuery = queryReturning([{
      _id: '64f000000000000000000002',
      counsellor: '64f000000000000000000003',
      amountPaise: 125000,
      razorpayPayoutId: 'pout_safe_123',
      referenceId: 'internal-safe-reference',
      status: 'processing',
      reconciliationStatus: 'needs_review',
      reconciliationMismatchCodes: ['PAYOUT_AMOUNT_MISMATCH'],
      createdAt: new Date('2026-07-23T10:00:00.000Z'),
      bankDetailsSnapshot: { accountNumberMasked: 'must-not-be-reported' },
    }]);
    const PayoutWebhookEventModel = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: 'needs_review', count: 2 },
        { _id: 'retryable_failure', count: 1 },
      ]),
      find: jest.fn(() => eventQuery),
    };
    const PayoutModel = {
      aggregate: jest.fn()
        .mockResolvedValueOnce([{ _id: 'processing', count: 3 }])
        .mockResolvedValueOnce([{ _id: 'needs_review', count: 2 }]),
      find: jest.fn(() => payoutQuery),
    };

    const report = await buildPayoutReconciliationReport({
      PayoutModel,
      PayoutWebhookEventModel,
      now: NOW,
      limit: 25,
      cursors: { payouts: '64f000000000000000000001' },
    });

    expect(report).toMatchObject({
      generatedAt: NOW.toISOString(),
      readOnly: true,
      policyThresholdsApplied: false,
      summary: {
        webhookEventStates: { needs_review: 2, retryable_failure: 1 },
        payoutStatuses: { processing: 3 },
        payoutReconciliationStates: { needs_review: 2 },
      },
      webhookEvents: [{
        id: '64f000000000000000000001',
        providerPayoutId: 'pout_safe_123',
        state: 'needs_review',
        ageSeconds: 3600,
      }],
      payouts: [{
        id: '64f000000000000000000002',
        counsellorId: '64f000000000000000000003',
        amountPaise: 125000,
        state: 'processing',
        reconciliationState: 'needs_review',
        ageSeconds: 7200,
      }],
    });
    expect(JSON.stringify(report)).not.toMatch(
      /must-not-be-reported|payloadDigest|providerEventId|bankDetails/
    );
    expect(eventQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /payloadDigest|providerEventId/
    ));
    expect(payoutQuery.select).toHaveBeenCalledWith(expect.not.stringMatching(
      /bankDetails|initiatedBy|approvedBy/
    ));
    expect(payoutQuery.limit).toHaveBeenCalledWith(26);
  });

  test('filters review states without inventing an age or finance threshold', () => {
    expect(buildPayoutIssueFilter('64f000000000000000000001')).toEqual({
      $and: [
        {
          $or: [
            { reconciliationStatus: 'needs_review' },
            { status: { $in: expect.any(Array) } },
          ],
        },
        { _id: { $gt: '64f000000000000000000001' } },
      ],
    });
  });

  test('paginates with one lookahead row', () => {
    expect(pageRows([{ _id: '1' }, { _id: '2' }, { _id: '3' }], 2)).toEqual({
      items: [{ _id: '1' }, { _id: '2' }],
      hasMore: true,
      nextAfterId: '2',
    });
  });

  test.each([0, 1001, 1.5, NaN])('rejects unsafe row limit %p', async (limit) => {
    await expect(buildPayoutReconciliationReport({
      PayoutModel: {},
      PayoutWebhookEventModel: {},
      now: NOW,
      limit,
    })).rejects.toThrow(/Report limit must be an integer/);
  });
});
