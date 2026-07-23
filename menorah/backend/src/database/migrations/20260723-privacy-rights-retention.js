const DataDeletionRequest = require('../../models/DataDeletionRequest');
const PrivacyEvent = require('../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../models/PrivacyRightsRequest');
const {
  appendPrivacyEvent,
  hashIdempotencyKey,
  verifyPrivacyEventOperation,
} = require('../../services/privacyEventService');

const MIGRATION_VERSION = '20260723-privacy-rights-retention-v1';

const legacyDeletionUpdate = () => ({
  $set: {
    workflowVersion: { $ifNull: ['$workflowVersion', 1] },
    legalHold: { $ifNull: ['$legalHold', false] },
  },
});

const registerLegacyDeletionEvidence = async () => {
  const requests = DataDeletionRequest.find({})
    .select('_id user status requestedAt')
    .sort({ _id: 1 })
    .lean()
    .cursor({ batchSize: 100 });
  for await (const request of requests) {
    const idempotencyKey = `legacy-deletion:${String(request._id)}`;
    const idempotencyKeyHash = hashIdempotencyKey({
      subjectUser: request.user,
      idempotencyKey,
    });
    const existing = await PrivacyEvent.findOne({ idempotencyKeyHash })
      .select('+idempotencyKeyHash +clientIdempotencyKeyHash')
      .lean();
    if (existing) {
      const verification = verifyPrivacyEventOperation(existing, {
        evidenceVersion: 'v2',
        eventType: 'legacy_deletion_request_registered',
        subjectUser: request.user,
        requestType: 'deletion',
        requestId: request._id,
        idempotencyKeyHash,
        fromStatus: null,
        toStatus: request.status,
      });
      if (!verification.valid) {
        const error = new Error(
          'Existing legacy deletion evidence failed integrity verification.'
        );
        error.code = 'PRIVACY_LEGACY_EVIDENCE_INVALID';
        throw error;
      }
      continue;
    }

    await appendPrivacyEvent({
      eventType: 'legacy_deletion_request_registered',
      actor: null,
      actorRole: 'system',
      subjectUser: request.user,
      requestType: 'deletion',
      requestId: request._id,
      source: 'privacy-workflow-migration',
      fromStatus: null,
      toStatus: request.status,
      policyVersion: MIGRATION_VERSION,
      idempotencyKey,
      occurredAt: request.requestedAt,
    });
  }
};

module.exports = {
  MIGRATION_VERSION,
  async up() {
    await DataDeletionRequest.updateMany({}, [legacyDeletionUpdate()]);
    await Promise.all([
      DataDeletionRequest.createIndexes(),
      PrivacyEvent.createIndexes(),
      PrivacyRightsRequest.createIndexes(),
    ]);
    await registerLegacyDeletionEvidence();
  },
  legacyDeletionUpdate,
  registerLegacyDeletionEvidence,
};
