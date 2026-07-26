const REPORTABLE_EVENT_STATES = Object.freeze([
  'needs_review',
  'retryable_failure',
]);
const REPORTABLE_PAYOUT_STATUSES = Object.freeze([
  'awaiting_approval',
  'processing',
  'queued',
  'pending',
  'on_hold',
  'reversed',
  'cancelled',
  'failed',
  'rejected',
  'expired',
]);
const MAX_REPORT_ROWS = 1000;

const asIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const ageSeconds = (value, now) => {
  const iso = asIsoString(value);
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
};

const normalizeCounts = (rows) => Object.fromEntries(
  (rows || []).filter((row) => typeof row?._id === 'string')
    .map((row) => [row._id, row.count])
);

const pageRows = (rows, limit) => {
  const items = (rows || []).slice(0, limit);
  const hasMore = (rows || []).length > limit;
  return {
    items,
    hasMore,
    nextAfterId: hasMore && items.length
      ? String(items[items.length - 1]._id)
      : null,
  };
};

const validateLimit = (limit) => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_REPORT_ROWS) {
    throw new Error(`Report limit must be an integer from 1 to ${MAX_REPORT_ROWS}`);
  }
  return limit;
};

const runLeanQuery = async (query, selection, limit) => query
  .select(selection)
  .sort({ _id: 1 })
  .limit(limit + 1)
  .lean();

const buildPayoutIssueFilter = (afterId) => ({
  $and: [
    {
      $or: [
        { reconciliationStatus: 'needs_review' },
        { status: { $in: REPORTABLE_PAYOUT_STATUSES } },
      ],
    },
    ...(afterId ? [{ _id: { $gt: afterId } }] : []),
  ],
});

const buildPayoutReconciliationReport = async ({
  PayoutModel,
  PayoutWebhookEventModel,
  now = new Date(),
  limit = 100,
  cursors = {},
}) => {
  const safeLimit = validateLimit(limit);
  const [
    eventCounts,
    payoutStatusCounts,
    payoutReconciliationCounts,
    eventRows,
    payoutRows,
  ] = await Promise.all([
    PayoutWebhookEventModel.aggregate([
      { $match: { processingState: { $in: REPORTABLE_EVENT_STATES } } },
      { $group: { _id: '$processingState', count: { $sum: 1 } } },
    ]),
    PayoutModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PayoutModel.aggregate([
      { $group: { _id: '$reconciliationStatus', count: { $sum: 1 } } },
    ]),
    runLeanQuery(
      PayoutWebhookEventModel.find({
        processingState: { $in: REPORTABLE_EVENT_STATES },
        ...(cursors.webhookEvents
          ? { _id: { $gt: cursors.webhookEvents } }
          : {}),
      }),
      [
        '_id',
        'eventType',
        'providerPayoutId',
        'payout',
        'processingState',
        'reconciliationDecision',
        'mismatchCodes',
        'failureCode',
        'deliveryCount',
        'identityConflictCount',
        'receivedAt',
        'lastDeliveryAt',
        'processedAt',
      ].join(' '),
      safeLimit
    ),
    runLeanQuery(
      PayoutModel.find(buildPayoutIssueFilter(cursors.payouts)),
      [
        '_id',
        'counsellor',
        'amountPaise',
        'razorpayPayoutId',
        'referenceId',
        'status',
        'reconciliationStatus',
        'reconciliationMismatchCodes',
        'approvalExpiresAt',
        'approvedAt',
        'lastWebhookAt',
        'createdAt',
        'updatedAt',
      ].join(' '),
      safeLimit
    ),
  ]);

  const eventPage = pageRows(eventRows, safeLimit);
  const payoutPage = pageRows(payoutRows, safeLimit);

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    policyThresholdsApplied: false,
    truncatedAt: safeLimit,
    pagination: {
      webhookEvents: {
        afterId: cursors.webhookEvents || null,
        hasMore: eventPage.hasMore,
        nextAfterId: eventPage.nextAfterId,
      },
      payouts: {
        afterId: cursors.payouts || null,
        hasMore: payoutPage.hasMore,
        nextAfterId: payoutPage.nextAfterId,
      },
    },
    summary: {
      webhookEventStates: normalizeCounts(eventCounts),
      payoutStatuses: normalizeCounts(payoutStatusCounts),
      payoutReconciliationStates: normalizeCounts(payoutReconciliationCounts),
    },
    webhookEvents: eventPage.items.map((event) => ({
      id: String(event._id),
      eventType: event.eventType,
      providerPayoutId: event.providerPayoutId || null,
      payoutId: event.payout ? String(event.payout) : null,
      state: event.processingState,
      decision: event.reconciliationDecision || null,
      mismatchCodes: event.mismatchCodes || [],
      failureCode: event.failureCode || null,
      deliveryCount: event.deliveryCount || 0,
      identityConflictCount: event.identityConflictCount || 0,
      receivedAt: asIsoString(event.receivedAt),
      ageSeconds: ageSeconds(event.receivedAt, now),
      lastDeliveryAt: asIsoString(event.lastDeliveryAt),
      processedAt: asIsoString(event.processedAt),
    })),
    payouts: payoutPage.items.map((payout) => ({
      id: String(payout._id),
      counsellorId: payout.counsellor ? String(payout.counsellor) : null,
      amountPaise: payout.amountPaise,
      providerPayoutId: payout.razorpayPayoutId || null,
      internalReference: payout.referenceId || null,
      state: payout.status,
      reconciliationState: payout.reconciliationStatus || 'pending',
      mismatchCodes: payout.reconciliationMismatchCodes || [],
      approvalExpiresAt: asIsoString(payout.approvalExpiresAt),
      approvedAt: asIsoString(payout.approvedAt),
      lastWebhookAt: asIsoString(payout.lastWebhookAt),
      createdAt: asIsoString(payout.createdAt),
      ageSeconds: ageSeconds(payout.createdAt, now),
      updatedAt: asIsoString(payout.updatedAt),
    })),
  };
};

module.exports = {
  REPORTABLE_EVENT_STATES,
  REPORTABLE_PAYOUT_STATUSES,
  MAX_REPORT_ROWS,
  buildPayoutIssueFilter,
  pageRows,
  buildPayoutReconciliationReport,
};
