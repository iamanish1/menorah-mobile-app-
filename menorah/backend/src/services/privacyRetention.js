const mongoose = require('mongoose');
const PrivacyRightsRequest = require('../models/PrivacyRightsRequest');
const { readPrivacyConfiguration } = require('../config/privacy');
const { appendPrivacyEvent } = require('./privacyEventService');

const DEFAULT_RETENTION_BATCH_SIZE = 25;
const MAX_RETENTION_BATCH_SIZE = 100;
const RETENTION_CATEGORY = 'privacy_rights_request_payload';

const normalizeBatchSize = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_RETENTION_BATCH_SIZE;
  }
  return Math.min(parsed, MAX_RETENTION_BATCH_SIZE);
};

const duePayloadFilter = (now, extra = {}, policyVersion = null) => ({
  ...extra,
  status: 'completed',
  payloadEncrypted: { $type: 'string' },
  'legalHold.active': { $ne: true },
  'retention.category': RETENTION_CATEGORY,
  'retention.policyVersion': policyVersion || { $type: 'string' },
  'retention.dueAt': { $type: 'date', $lte: now },
  'retention.payloadDisposedAt': null,
});

const runTransaction = async (work, mongooseInstance = mongoose) => {
  const session = await mongooseInstance.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const withSession = (query, session) => {
  if (session && typeof query.session === 'function') return query.session(session);
  return query;
};

const createPrivacyRetentionService = ({
  RightsRequestModel = PrivacyRightsRequest,
  appendEvent = appendPrivacyEvent,
  readConfig = readPrivacyConfiguration,
  transactionRunner = runTransaction,
  beforeDispositionWrite = async () => {},
} = {}) => {
  const disposeOne = async ({ requestId, now = new Date() }) => {
    const config = readConfig();
    const category = config.retentionPolicy?.categories?.[RETENTION_CATEGORY];
    if (!config.retentionExecutionEnabled || category?.mode !== 'automated') {
      return { requestId: String(requestId), outcome: 'execution_disabled' };
    }

    return transactionRunner(async (session) => {
      const query = RightsRequestModel.findOne(
        duePayloadFilter(
          now,
          { _id: requestId },
          config.retentionPolicy.version
        )
      ).select('user requestType retention.policyVersion workflowVersion');
      const candidateQuery = withSession(query, session);
      const candidate = typeof candidateQuery.lean === 'function'
        ? await candidateQuery.lean()
        : await candidateQuery;
      if (!candidate) {
        return { requestId: String(requestId), outcome: 'not_due_or_protected' };
      }

      await beforeDispositionWrite({
        requestId: candidate._id,
        workflowVersion: candidate.workflowVersion || 1,
        session,
      });

      // Repeat every eligibility predicate and the workflow version. A hold
      // that commits first invalidates this CAS; a disposition that commits
      // first makes the later hold fail rather than recording it retroactively.
      const result = await RightsRequestModel.updateOne(
        duePayloadFilter(
          now,
          {
            _id: requestId,
            workflowVersion: candidate.workflowVersion || 1,
          },
          config.retentionPolicy.version
        ),
        {
          $unset: { payloadEncrypted: '' },
          $set: { 'retention.payloadDisposedAt': now },
          $inc: { workflowVersion: 1 },
        },
        session ? { session, runValidators: true } : { runValidators: true }
      );
      if (result.modifiedCount !== 1) {
        return { requestId: String(requestId), outcome: 'not_due_or_protected' };
      }

      await appendEvent({
        eventType: 'retention_payload_disposed',
        actor: null,
        actorRole: 'system',
        subjectUser: candidate.user,
        requestType: candidate.requestType,
        requestId: candidate._id,
        source: 'privacy-retention-worker',
        retentionCategory: RETENTION_CATEGORY,
        policyVersion: candidate.retention?.policyVersion,
        occurredAt: now,
        session,
      });
      return { requestId: String(requestId), outcome: 'payload_disposed' };
    });
  };

  const processBatch = async ({ now = new Date(), limit } = {}) => {
    const config = readConfig();
    const category = config.retentionPolicy?.categories?.[RETENTION_CATEGORY];
    if (!config.retentionExecutionEnabled || category?.mode !== 'automated') {
      return {
        disabled: true,
        scanned: 0,
        disposed: 0,
        protectedOrChanged: 0,
        failed: 0,
        failures: [],
      };
    }

    const boundedLimit = normalizeBatchSize(limit);
    const candidates = await RightsRequestModel.find(duePayloadFilter(
      now,
      {},
      config.retentionPolicy.version
    ))
      .select('_id')
      .sort({ 'retention.dueAt': 1, _id: 1 })
      .limit(boundedLimit)
      .lean();
    const summary = {
      disabled: false,
      scanned: candidates.length,
      disposed: 0,
      protectedOrChanged: 0,
      failed: 0,
      failures: [],
    };
    for (const candidate of candidates) {
      try {
        const result = await disposeOne({ requestId: candidate._id, now });
        if (result.outcome === 'payload_disposed') summary.disposed += 1;
        else summary.protectedOrChanged += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          requestId: String(candidate._id),
          code: String(error?.code || 'PRIVACY_RETENTION_FAILED').slice(0, 64),
        });
      }
    }
    return summary;
  };

  return { disposeOne, processBatch };
};

module.exports = {
  DEFAULT_RETENTION_BATCH_SIZE,
  MAX_RETENTION_BATCH_SIZE,
  RETENTION_CATEGORY,
  createPrivacyRetentionService,
  duePayloadFilter,
  normalizeBatchSize,
  privacyRetentionService: createPrivacyRetentionService(),
};
