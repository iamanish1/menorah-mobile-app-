const crypto = require('crypto');
const mongoose = require('mongoose');
const DataDeletionRequest = require('../models/DataDeletionRequest');
const PrivacyEvent = require('../models/PrivacyEvent');
const PrivacyRightsRequest = require('../models/PrivacyRightsRequest');
const {
  readPrivacyConfiguration,
} = require('../config/privacy');
const {
  decryptPrivacyPayload,
  encryptPrivacyPayload,
} = require('../utils/privacyPayloadEncryption');
const {
  appendPrivacyEvent,
  hashIdempotencyKey,
  verifyPrivacyEventOperation,
} = require('./privacyEventService');

const ACTIVE_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'action_required',
]);
const TERMINAL_STATUSES = Object.freeze(['completed', 'rejected', 'cancelled']);
const RIGHTS_TRANSITIONS = Object.freeze({
  submitted: Object.freeze(['under_review', 'cancelled']),
  under_review: Object.freeze(['action_required', 'completed', 'rejected']),
  action_required: Object.freeze(['under_review', 'cancelled']),
  completed: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([]),
});
const DELETION_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['under_review', 'rejected']),
  under_review: Object.freeze(['completed', 'rejected']),
  completed: Object.freeze([]),
  rejected: Object.freeze([]),
});
const ALLOWED_CORRECTION_FIELDS = new Set([
  'name',
  'date_of_birth',
  'gender',
  'phone',
  'email',
  'address',
  'emergency_contact',
  'other',
]);

const makeError = (code, message, statusCode = 409) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

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

const leanResult = async (query, session) => {
  const sessionQuery = withSession(query, session);
  if (typeof sessionQuery.lean === 'function') return sessionQuery.lean();
  return sessionQuery;
};

const hashActiveKey = ({ userId, requestType }) => crypto
  .createHash('sha256')
  .update(`${String(userId)}:${requestType}`)
  .digest('hex');

const normalizeSource = (source) => {
  const normalized = String(source || 'authenticated-api').trim().toLowerCase();
  if (!/^[a-z0-9_.:-]{1,64}$/.test(normalized)) return 'authenticated-api';
  return normalized;
};

const stableSubmission = ({ requestType, normalized }) => JSON.stringify({
  requestType,
  scope: normalized.scope || null,
  correctionFields: [...(normalized.correctionFields || [])].sort(),
  contactChannel: normalized.contactChannel,
  payload: normalized.payload,
});

const withoutSensitiveSubmissionFields = (request) => {
  const safe = { ...request };
  delete safe.activeKey;
  delete safe.idempotencyKeyHash;
  delete safe.payloadEncrypted;
  return safe;
};

const validateEvidenceReference = (value) => {
  const normalized = String(value || '').trim();
  if (!/^[a-zA-Z0-9_.:/-]{8,128}$/.test(normalized)) {
    throw makeError(
      'PRIVACY_EVIDENCE_REFERENCE_INVALID',
      'A bounded non-sensitive evidence reference is required.',
      400
    );
  }
  return normalized;
};

const normalizeSubmission = ({ requestType, body = {} }) => {
  if (!['export', 'correction', 'grievance'].includes(requestType)) {
    throw makeError('PRIVACY_REQUEST_TYPE_INVALID', 'Privacy request type is invalid.', 400);
  }

  const contactChannel = ['in_app', 'email'].includes(body.contactChannel)
    ? body.contactChannel
    : 'in_app';
  if (requestType === 'export') {
    if (body.scope !== undefined && body.scope !== 'account_data') {
      throw makeError(
        'PRIVACY_EXPORT_SCOPE_INVALID',
        'Only the bounded account-data export request scope is supported.',
        400
      );
    }
    return {
      scope: 'account_data',
      correctionFields: [],
      contactChannel,
      payload: { deliveryInstructions: 'manual_secure_delivery_required' },
    };
  }

  const description = String(body.description || '').trim();
  if (description.length < 10 || description.length > 4000) {
    throw makeError(
      'PRIVACY_REQUEST_DESCRIPTION_INVALID',
      'A description between 10 and 4000 characters is required.',
      400
    );
  }

  if (requestType === 'correction') {
    const correctionFields = Array.isArray(body.correctionFields)
      ? [...new Set(body.correctionFields)]
      : [];
    if (
      correctionFields.length < 1
      || correctionFields.length > 8
      || correctionFields.some((field) => !ALLOWED_CORRECTION_FIELDS.has(field))
    ) {
      throw makeError(
        'PRIVACY_CORRECTION_FIELDS_INVALID',
        'Select one or more supported correction fields.',
        400
      );
    }
    return {
      scope: null,
      correctionFields,
      contactChannel,
      payload: { description },
    };
  }

  return {
    scope: null,
    correctionFields: [],
    contactChannel,
    payload: { description },
  };
};

const serializeRightsRequest = (request) => ({
  id: String(request._id),
  requestType: request.requestType,
  status: request.status,
  source: request.source,
  scope: request.scope || null,
  correctionFields: request.correctionFields || [],
  contactChannel: request.contactChannel,
  submittedAt: request.submittedAt,
  underReviewAt: request.underReviewAt || null,
  completedAt: request.completedAt || null,
  rejectedAt: request.rejectedAt || null,
  cancelledAt: request.cancelledAt || null,
  legalHoldActive: request.legalHold?.active === true,
  payloadDisposedAt: request.retention?.payloadDisposedAt || null,
});

const serializeDeletionRequest = (request) => ({
  id: String(request._id),
  status: request.status,
  requestedAt: request.requestedAt,
  accountDeactivatedAt: request.accountDeactivatedAt,
  retentionReviewAfter: request.retentionReviewAfter,
  underReviewAt: request.underReviewAt || null,
  completedAt: request.completedAt || null,
  rejectedAt: request.rejectedAt || null,
  legalHoldActive: request.legalHold === true,
});

const createPrivacyRightsWorkflow = ({
  RightsRequestModel = PrivacyRightsRequest,
  DeletionRequestModel = DataDeletionRequest,
  PrivacyEventModel = PrivacyEvent,
  appendEvent = appendPrivacyEvent,
  verifyEvent = verifyPrivacyEventOperation,
  encryptPayload = encryptPrivacyPayload,
  decryptPayload = decryptPrivacyPayload,
  readConfig = readPrivacyConfiguration,
  transactionRunner = runTransaction,
  beforeLegalHoldWrite = async () => {},
} = {}) => {
  const submitRequest = async ({
    user,
    requestType,
    body,
    source,
    idempotencyKey = null,
    now = new Date(),
  }) => {
    const normalized = normalizeSubmission({ requestType, body });
    const activeKey = hashActiveKey({ userId: user._id, requestType });
    const idempotencyKeyHash = hashIdempotencyKey({
      subjectUser: user._id,
      idempotencyKey,
    });

    const rejectSubmissionMismatch = (code, message) => {
      throw makeError(
        code,
        message
      );
    };

    const verifySubmissionEvidence = async (existing) => {
      const query = PrivacyEventModel.findOne({
        eventType: 'rights_request_submitted',
        requestId: existing._id,
        subjectUser: existing.user,
      });
      if (typeof query.select === 'function') {
        query.select('+idempotencyKeyHash +clientIdempotencyKeyHash');
      }
      const event = await leanResult(query, null);
      const verification = event && verifyEvent(event, {
        evidenceVersion: 'v2',
        eventType: 'rights_request_submitted',
        subjectUser: existing.user,
        requestType: existing.requestType,
        requestId: existing._id,
        idempotencyKeyHash: existing.idempotencyKeyHash || null,
        fromStatus: null,
        toStatus: 'submitted',
      });
      if (!verification?.valid) {
        throw makeError(
          'PRIVACY_REQUEST_EVIDENCE_INVALID',
          'Stored privacy request evidence failed integrity verification.',
          503
        );
      }
    };

    const resolveEquivalentSubmission = async ({
      existing,
      mismatchCode,
      mismatchMessage,
    }) => {
      await verifySubmissionEvidence(existing);
      if (existing.requestType !== requestType) {
        return rejectSubmissionMismatch(mismatchCode, mismatchMessage);
      }
      let storedPayload;
      try {
        storedPayload = existing.payloadEncrypted
          ? decryptPayload(existing.payloadEncrypted, {
            context: `privacy-request:${String(existing._id)}`,
          })
          : requestType === 'export'
            ? { deliveryInstructions: 'manual_secure_delivery_required' }
            : null;
      } catch {
        storedPayload = null;
      }
      const storedSubmission = storedPayload && {
        scope: existing.scope || null,
        correctionFields: existing.correctionFields || [],
        contactChannel: existing.contactChannel || 'in_app',
        payload: storedPayload,
      };
      if (
        !storedSubmission
        || stableSubmission({ requestType, normalized: storedSubmission })
          !== stableSubmission({ requestType, normalized })
      ) {
        return rejectSubmissionMismatch(mismatchCode, mismatchMessage);
      }
      return {
        request: withoutSensitiveSubmissionFields(existing),
        created: false,
      };
    };

    const findIdempotentRequest = async () => {
      if (!idempotencyKeyHash) return null;
      const query = RightsRequestModel.findOne({ idempotencyKeyHash })
        .select('+payloadEncrypted +idempotencyKeyHash');
      return leanResult(query, null);
    };

    const idempotentRequest = await findIdempotentRequest();
    if (idempotentRequest) {
      return resolveEquivalentSubmission({
        existing: idempotentRequest,
        mismatchCode: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
        mismatchMessage: 'Idempotency-Key was already used for a different privacy request.',
      });
    }

    const findActiveRequest = () => leanResult(
      RightsRequestModel.findOne({ activeKey })
        .select('+payloadEncrypted +idempotencyKeyHash'),
      null
    );
    const existingActive = await findActiveRequest();
    if (existingActive) {
      return resolveEquivalentSubmission({
        existing: existingActive,
        mismatchCode: 'PRIVACY_ACTIVE_REQUEST_CONFLICT',
        mismatchMessage: 'A different active privacy request of this type already exists.',
      });
    }

    try {
      const request = await transactionRunner(async (session) => {
        const _id = new mongoose.Types.ObjectId();
        const payloadEncrypted = encryptPayload(normalized.payload, {
          context: `privacy-request:${String(_id)}`,
        });
        const [created] = await RightsRequestModel.create([{
          _id,
          user: user._id,
          requestType,
          status: 'submitted',
          activeKey,
          idempotencyKeyHash,
          source: normalizeSource(source),
          scope: normalized.scope,
          correctionFields: normalized.correctionFields,
          contactChannel: normalized.contactChannel,
          payloadEncrypted,
          submittedAt: now,
        }], session ? { session } : undefined);

        await appendEvent({
          eventType: 'rights_request_submitted',
          actor: user._id,
          actorRole: user.role,
          subjectUser: user._id,
          requestType,
          requestId: created._id,
          source: normalizeSource(source),
          idempotencyKey,
          fromStatus: null,
          toStatus: 'submitted',
          occurredAt: now,
          session,
        });
        return created;
      });
      return { request, created: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicateByIdempotency = await findIdempotentRequest();
      if (duplicateByIdempotency) {
        return resolveEquivalentSubmission({
          existing: duplicateByIdempotency,
          mismatchCode: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
          mismatchMessage: 'Idempotency-Key was already used for a different privacy request.',
        });
      }
      const duplicateActive = await findActiveRequest();
      if (!duplicateActive) throw error;
      return resolveEquivalentSubmission({
        existing: duplicateActive,
        mismatchCode: 'PRIVACY_ACTIVE_REQUEST_CONFLICT',
        mismatchMessage: 'A different active privacy request of this type already exists.',
      });
    }
  };

  const listOwnRequests = async ({ userId, limit = 50 }) => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    return RightsRequestModel.find({ user: userId })
      .sort({ submittedAt: -1, _id: -1 })
      .limit(boundedLimit)
      .lean();
  };

  const getOwnRequest = ({ userId, requestId }) => (
    RightsRequestModel.findOne({ _id: requestId, user: userId }).lean()
  );

  const getOwnDeletionRequest = ({ userId, requestId = null }) => (
    DeletionRequestModel.findOne({
      ...(requestId ? { _id: requestId } : {}),
      user: userId,
    }).lean()
  );

  const getRequestPayloadForAdmin = async ({ requestId }) => {
    const query = RightsRequestModel.findById(requestId).select('+payloadEncrypted');
    const request = await leanResult(query, null);
    if (!request) return null;
    return {
      request,
      payload: request.payloadEncrypted
        ? decryptPayload(request.payloadEncrypted, {
          context: `privacy-request:${String(request._id)}`,
        })
        : null,
    };
  };

  const listAdminRequests = ({
    requestType,
    status,
    limit = 50,
  } = {}) => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    return RightsRequestModel.find({
      ...(requestType ? { requestType } : {}),
      ...(status ? { status } : {}),
    })
      .sort({ submittedAt: 1, _id: 1 })
      .limit(boundedLimit)
      .lean();
  };

  const listAdminDeletionRequests = ({ status, limit = 50 } = {}) => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    return DeletionRequestModel.find(status ? { status } : {})
      .sort({ requestedAt: 1, _id: 1 })
      .limit(boundedLimit)
      .lean();
  };

  const transitionRightsRequest = async ({
    requestId,
    admin,
    toStatus,
    evidenceReference,
    source,
    now = new Date(),
  }) => transactionRunner(async (session) => {
    const current = await leanResult(RightsRequestModel.findById(requestId), session);
    if (!current) {
      throw makeError('PRIVACY_REQUEST_NOT_FOUND', 'Privacy request not found.', 404);
    }
    if (!RIGHTS_TRANSITIONS[current.status]?.includes(toStatus)) {
      throw makeError(
        'PRIVACY_REQUEST_TRANSITION_INVALID',
        `Privacy request cannot transition from ${current.status} to ${toStatus}.`
      );
    }
    const reference = validateEvidenceReference(evidenceReference);
    const update = {
      $set: {
        status: toStatus,
        reviewedBy: admin._id,
        resolutionEvidenceReference: reference,
      },
      $inc: { workflowVersion: 1 },
    };
    if (toStatus === 'under_review') update.$set.underReviewAt = now;
    if (toStatus === 'completed') update.$set.completedAt = now;
    if (toStatus === 'rejected') update.$set.rejectedAt = now;
    if (toStatus === 'cancelled') update.$set.cancelledAt = now;
    if (TERMINAL_STATUSES.includes(toStatus)) update.$unset = { activeKey: '' };

    if (toStatus === 'completed') {
      const policy = readConfig().retentionPolicy;
      const category = policy?.categories?.privacy_rights_request_payload;
      update.$set['retention.policyVersion'] = policy?.version || null;
      if (category?.retentionDays) {
        update.$set['retention.dueAt'] = new Date(
          now.getTime() + category.retentionDays * 24 * 60 * 60 * 1000
        );
      }
    }

    const updated = await withSession(RightsRequestModel.findOneAndUpdate(
      {
        _id: requestId,
        status: current.status,
        workflowVersion: current.workflowVersion || 1,
      },
      update,
      { new: true, runValidators: true }
    ), session);
    if (!updated) {
      throw makeError(
        'PRIVACY_REQUEST_CONCURRENT_TRANSITION',
        'Privacy request changed concurrently; reload before retrying.'
      );
    }

    await appendEvent({
      eventType: 'rights_request_status_changed',
      actor: admin._id,
      actorRole: 'admin',
      subjectUser: current.user,
      requestType: current.requestType,
      requestId: current._id,
      source: normalizeSource(source),
      fromStatus: current.status,
      toStatus,
      policyVersion: update.$set['retention.policyVersion'] || null,
      occurredAt: now,
      session,
    });
    return updated;
  });

  const transitionDeletionRequest = async ({
    requestId,
    admin,
    toStatus,
    evidenceReference,
    source,
    now = new Date(),
  }) => transactionRunner(async (session) => {
    const current = await leanResult(DeletionRequestModel.findById(requestId), session);
    if (!current) {
      throw makeError('DELETION_REQUEST_NOT_FOUND', 'Deletion request not found.', 404);
    }
    if (!DELETION_TRANSITIONS[current.status]?.includes(toStatus)) {
      throw makeError(
        'DELETION_REQUEST_TRANSITION_INVALID',
        `Deletion request cannot transition from ${current.status} to ${toStatus}.`
      );
    }
    const reference = validateEvidenceReference(evidenceReference);
    const filter = {
      _id: requestId,
      status: current.status,
      workflowVersion: current.workflowVersion || 1,
    };
    if (toStatus === 'completed') filter.legalHold = { $ne: true };
    const update = {
      $set: {
        status: toStatus,
        reviewedBy: admin._id,
        resolutionEvidenceReference: reference,
      },
      $inc: { workflowVersion: 1 },
    };
    if (toStatus === 'under_review') update.$set.underReviewAt = now;
    if (toStatus === 'completed') update.$set.completedAt = now;
    if (toStatus === 'rejected') update.$set.rejectedAt = now;

    const updated = await withSession(DeletionRequestModel.findOneAndUpdate(
      filter,
      update,
      { new: true, runValidators: true }
    ), session);
    if (!updated) {
      throw makeError(
        'DELETION_REQUEST_HELD_OR_CHANGED',
        'Deletion review is held or changed concurrently; reload before retrying.'
      );
    }
    await appendEvent({
      eventType: 'deletion_request_status_changed',
      actor: admin._id,
      actorRole: 'admin',
      subjectUser: current.user,
      requestType: 'deletion',
      requestId: current._id,
      source: normalizeSource(source),
      fromStatus: current.status,
      toStatus,
      occurredAt: now,
      session,
    });
    return updated;
  });

  const setLegalHold = async ({
    kind,
    requestId,
    admin,
    action,
    policyReference,
    source,
    now = new Date(),
  }) => transactionRunner(async (session) => {
    if (!['apply', 'release'].includes(action)) {
      throw makeError('LEGAL_HOLD_ACTION_INVALID', 'Legal-hold action is invalid.', 400);
    }
    const reference = validateEvidenceReference(policyReference);
    const isDeletion = kind === 'deletion';
    const Model = isDeletion ? DeletionRequestModel : RightsRequestModel;
    const current = await leanResult(Model.findById(requestId), session);
    if (!current) {
      throw makeError('PRIVACY_REQUEST_NOT_FOUND', 'Privacy request not found.', 404);
    }

    const activePath = isDeletion ? 'legalHold' : 'legalHold.active';
    if (
      !isDeletion
      && action === 'apply'
      && current.retention?.payloadDisposedAt
    ) {
      throw makeError(
        'LEGAL_HOLD_PAYLOAD_ALREADY_DISPOSED',
        'A legal hold cannot be applied after the protected payload was disposed.'
      );
    }
    const filter = {
      _id: requestId,
      [activePath]: action === 'apply' ? { $ne: true } : true,
      workflowVersion: current.workflowVersion || 1,
    };
    if (!isDeletion && action === 'apply') {
      filter['retention.payloadDisposedAt'] = null;
    }
    const update = action === 'apply'
      ? {
        $set: isDeletion
          ? {
            legalHold: true,
            legalHoldSetAt: now,
            legalHoldSetBy: admin._id,
            legalHoldPolicyReference: reference,
            legalHoldReleasedAt: null,
            legalHoldReleasedBy: null,
          }
          : {
            'legalHold.active': true,
            'legalHold.setAt': now,
            'legalHold.setBy': admin._id,
            'legalHold.policyReference': reference,
            'legalHold.releasedAt': null,
            'legalHold.releasedBy': null,
          },
      }
      : {
        $set: isDeletion
          ? {
            legalHold: false,
            legalHoldReleasedAt: now,
            legalHoldReleasedBy: admin._id,
          }
          : {
            'legalHold.active': false,
            'legalHold.releasedAt': now,
            'legalHold.releasedBy': admin._id,
          },
      };
    update.$inc = { workflowVersion: 1 };
    await beforeLegalHoldWrite({
      kind,
      requestId,
      action,
      workflowVersion: current.workflowVersion || 1,
      session,
    });
    const updated = await withSession(Model.findOneAndUpdate(
      filter,
      update,
      { new: true, runValidators: true }
    ), session);
    if (!updated) {
      throw makeError(
        'LEGAL_HOLD_CONCURRENT_CHANGE',
        'Legal-hold state changed concurrently; reload before retrying.'
      );
    }
    await appendEvent({
      eventType: action === 'apply' ? 'legal_hold_applied' : 'legal_hold_released',
      actor: admin._id,
      actorRole: 'admin',
      subjectUser: current.user,
      requestType: isDeletion ? 'deletion' : current.requestType,
      requestId: current._id,
      source: normalizeSource(source),
      policyVersion: reference,
      occurredAt: now,
      session,
    });
    return updated;
  });

  return {
    getOwnDeletionRequest,
    getOwnRequest,
    getRequestPayloadForAdmin,
    listAdminDeletionRequests,
    listAdminRequests,
    listOwnRequests,
    setLegalHold,
    submitRequest,
    transitionDeletionRequest,
    transitionRightsRequest,
  };
};

module.exports = {
  ACTIVE_STATUSES,
  DELETION_TRANSITIONS,
  RIGHTS_TRANSITIONS,
  TERMINAL_STATUSES,
  createPrivacyRightsWorkflow,
  hashActiveKey,
  normalizeSubmission,
  privacyRightsWorkflow: createPrivacyRightsWorkflow(),
  serializeDeletionRequest,
  serializeRightsRequest,
};
