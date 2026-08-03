const REPORTABLE_EVENT_STATES = Object.freeze([
  'needs_review',
  'retryable_failure',
]);
const REPORTABLE_ATTEMPT_STATES = Object.freeze(['needs_review']);
const REPORTABLE_BOOKING_FILTER = Object.freeze({
  paymentStatus: { $ne: 'refunded' },
  'bookingAuthorization.status': 'needs_review',
});
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

const normalizeCounts = (rows, allowedStates) => {
  const counts = Object.fromEntries(allowedStates.map((state) => [state, 0]));
  for (const row of rows || []) {
    if (Object.hasOwn(counts, row?._id)) counts[row._id] = row.count;
  }
  return counts;
};

const runLeanQuery = async (query, selection, limit) =>
  query
    .select(selection)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();

const withCursor = (filter, afterId) => (
  afterId
    ? { ...filter, _id: { $gt: afterId } }
    : filter
);

const pageRows = (rows, limit) => {
  const safeRows = rows || [];
  const items = safeRows.slice(0, limit);
  const hasMore = safeRows.length > limit;
  return {
    items,
    hasMore,
    nextAfterId: hasMore && items.length > 0
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

const buildPaidAuthorizationGapFilter = (now) => {
  const authorizationQuery = buildBookingAuthorizationQuery({ now });
  return {
    paymentStatus: 'paid',
    $nor: authorizationQuery.$or,
  };
};

const buildPaymentReconciliationReport = async ({
  PaymentAttemptModel,
  PaymentWebhookEventModel,
  BookingModel,
  now = new Date(),
  limit = 100,
  cursors = {},
}) => {
  const safeLimit = validateLimit(limit);
  const [
    eventCounts,
    attemptCounts,
    bookingCount,
    paidAuthorizationGapCount,
    eventRows,
    attemptRows,
    bookingRows,
    paidAuthorizationGapRows,
  ] = await Promise.all([
    PaymentWebhookEventModel.aggregate([
      { $match: { processingState: { $in: REPORTABLE_EVENT_STATES } } },
      { $group: { _id: '$processingState', count: { $sum: 1 } } },
    ]),
    PaymentAttemptModel.aggregate([
      { $match: { status: { $in: REPORTABLE_ATTEMPT_STATES } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BookingModel.countDocuments(REPORTABLE_BOOKING_FILTER),
    BookingModel.countDocuments(buildPaidAuthorizationGapFilter(now)),
    runLeanQuery(
      PaymentWebhookEventModel.find({
        processingState: { $in: REPORTABLE_EVENT_STATES },
        ...(cursors.webhookEvents
          ? { _id: { $gt: cursors.webhookEvents } }
          : {}),
      }),
      [
        '_id',
        'eventType',
        'processingState',
        'reconciliationDecision',
        'mismatchCodes',
        'failureCode',
        'processingAttempts',
        'deliveryCount',
        'identityConflictCount',
        'receivedAt',
        'lastAttemptAt',
        'nextRetryAt',
        'subject.orderId',
        'subject.paymentId',
        'subject.booking',
        'subject.paymentAttempt',
        'createdAt',
      ].join(' '),
      safeLimit
    ),
    runLeanQuery(
      PaymentAttemptModel.find({
        status: { $in: REPORTABLE_ATTEMPT_STATES },
        ...(cursors.paymentAttempts
          ? { _id: { $gt: cursors.paymentAttempts } }
          : {}),
      }),
      [
        '_id',
        'booking',
        'orderId',
        'paymentId',
        'status',
        'expiresAt',
        'reconciliation.lastDecision',
        'reconciliation.mismatchCodes',
        'reconciliation.lastSource',
        'reconciliation.providerOrderStatus',
        'reconciliation.providerPaymentStatus',
        'reconciliation.evaluatedAt',
        'createdAt',
        'updatedAt',
      ].join(' '),
      safeLimit
    ),
    runLeanQuery(
      BookingModel.find(withCursor(
        REPORTABLE_BOOKING_FILTER,
        cursors.quarantinedBookings,
      )),
      [
        '_id',
        'counsellor',
        'status',
        'paymentStatus',
        'razorpayOrderId',
        'paymentId',
        'orderStatus',
        'scheduledAt',
        'sessionDuration',
        'holdExpiresAt',
        'createdAt',
        'updatedAt',
      ].join(' '),
      safeLimit
    ),
    runLeanQuery(
      BookingModel.find(withCursor(
        buildPaidAuthorizationGapFilter(now),
        cursors.paidAuthorizationGaps,
      )),
      [
        '_id',
        'counsellor',
        'status',
        'paymentStatus',
        'paymentMethod',
        'isSubscriptionBooking',
        'razorpayOrderId',
        'paymentId',
        'orderStatus',
        'scheduledAt',
        'sessionDuration',
        'bookingAuthorization.kind',
        'bookingAuthorization.status',
        'createdAt',
        'updatedAt',
      ].join(' '),
      safeLimit
    ),
  ]);

  const eventPage = pageRows(eventRows, safeLimit);
  const attemptPage = pageRows(attemptRows, safeLimit);
  const bookingPage = pageRows(bookingRows, safeLimit);
  const paidAuthorizationGapPage = pageRows(
    paidAuthorizationGapRows,
    safeLimit,
  );

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    truncatedAt: safeLimit,
    pagination: {
      webhookEvents: {
        afterId: cursors.webhookEvents || null,
        hasMore: eventPage.hasMore,
        nextAfterId: eventPage.nextAfterId,
      },
      paymentAttempts: {
        afterId: cursors.paymentAttempts || null,
        hasMore: attemptPage.hasMore,
        nextAfterId: attemptPage.nextAfterId,
      },
      quarantinedBookings: {
        afterId: cursors.quarantinedBookings || null,
        hasMore: bookingPage.hasMore,
        nextAfterId: bookingPage.nextAfterId,
      },
      paidAuthorizationGaps: {
        afterId: cursors.paidAuthorizationGaps || null,
        hasMore: paidAuthorizationGapPage.hasMore,
        nextAfterId: paidAuthorizationGapPage.nextAfterId,
      },
    },
    summary: {
      webhookEvents: normalizeCounts(eventCounts, REPORTABLE_EVENT_STATES),
      paymentAttempts: normalizeCounts(attemptCounts, REPORTABLE_ATTEMPT_STATES),
      quarantinedBookings: bookingCount,
      paidAuthorizationGaps: paidAuthorizationGapCount,
    },
    webhookEvents: eventPage.items.map((event) => ({
      id: String(event._id),
      eventType: event.eventType,
      state: event.processingState,
      decision: event.reconciliationDecision || null,
      mismatchCodes: event.mismatchCodes || [],
      failureCode: event.failureCode || null,
      processingAttempts: event.processingAttempts || 0,
      deliveryCount: event.deliveryCount || 0,
      identityConflictCount: event.identityConflictCount || 0,
      receivedAt: asIsoString(event.receivedAt || event.createdAt),
      ageSeconds: ageSeconds(event.receivedAt || event.createdAt, now),
      lastAttemptAt: asIsoString(event.lastAttemptAt),
      nextRetryAt: asIsoString(event.nextRetryAt),
      providerOrderId: event.subject?.orderId || null,
      providerPaymentId: event.subject?.paymentId || null,
      bookingId: event.subject?.booking ? String(event.subject.booking) : null,
      paymentAttemptId: event.subject?.paymentAttempt
        ? String(event.subject.paymentAttempt)
        : null,
    })),
    paymentAttempts: attemptPage.items.map((attempt) => ({
      id: String(attempt._id),
      state: attempt.status,
      bookingId: attempt.booking ? String(attempt.booking) : null,
      providerOrderId: attempt.orderId || null,
      providerPaymentId: attempt.paymentId || null,
      decision: attempt.reconciliation?.lastDecision || null,
      mismatchCodes: attempt.reconciliation?.mismatchCodes || [],
      source: attempt.reconciliation?.lastSource || null,
      providerOrderStatus:
        attempt.reconciliation?.providerOrderStatus || null,
      providerPaymentStatus:
        attempt.reconciliation?.providerPaymentStatus || null,
      evaluatedAt: asIsoString(attempt.reconciliation?.evaluatedAt),
      expiresAt: asIsoString(attempt.expiresAt),
      createdAt: asIsoString(attempt.createdAt),
      ageSeconds: ageSeconds(attempt.createdAt, now),
      updatedAt: asIsoString(attempt.updatedAt),
    })),
    quarantinedBookings: bookingPage.items.map((booking) => ({
      id: String(booking._id),
      counsellorId: booking.counsellor ? String(booking.counsellor) : null,
      state: booking.status,
      paymentState: booking.paymentStatus,
      providerOrderId: booking.razorpayOrderId || null,
      providerPaymentId: booking.paymentId || null,
      providerOrderStatus: booking.orderStatus || null,
      scheduledAt: asIsoString(booking.scheduledAt),
      sessionDuration: booking.sessionDuration || null,
      holdExpiresAt: asIsoString(booking.holdExpiresAt),
      createdAt: asIsoString(booking.createdAt),
      ageSeconds: ageSeconds(booking.createdAt, now),
      updatedAt: asIsoString(booking.updatedAt),
    })),
    paidAuthorizationGaps: paidAuthorizationGapPage.items.map((booking) => ({
      id: String(booking._id),
      counsellorId: booking.counsellor ? String(booking.counsellor) : null,
      state: booking.status,
      paymentState: booking.paymentStatus,
      paymentMethod: booking.paymentMethod || null,
      isSubscriptionBooking: booking.isSubscriptionBooking === true,
      authorizationKind: booking.bookingAuthorization?.kind || null,
      authorizationState: booking.bookingAuthorization?.status || null,
      providerOrderId: booking.razorpayOrderId || null,
      providerPaymentId: booking.paymentId || null,
      providerOrderStatus: booking.orderStatus || null,
      scheduledAt: asIsoString(booking.scheduledAt),
      sessionDuration: booking.sessionDuration || null,
      createdAt: asIsoString(booking.createdAt),
      ageSeconds: ageSeconds(booking.createdAt, now),
      updatedAt: asIsoString(booking.updatedAt),
    })),
  };
};

module.exports = {
  REPORTABLE_EVENT_STATES,
  REPORTABLE_ATTEMPT_STATES,
  REPORTABLE_BOOKING_FILTER,
  buildPaidAuthorizationGapFilter,
  MAX_REPORT_ROWS,
  pageRows,
  buildPaymentReconciliationReport,
};
const {
  buildBookingAuthorizationQuery,
} = require('./bookingMarketplacePolicy');
