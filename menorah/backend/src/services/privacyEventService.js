const crypto = require('crypto');
const mongoose = require('mongoose');
const PrivacyEvent = require('../models/PrivacyEvent');

const requireAuditKey = () => {
  const key = String(process.env.AUDIT_LOG_SIGNING_KEY || '').trim();
  if (key.length < 32 || /^REPLACE/i.test(key)) {
    const error = new Error('Privacy audit evidence signing is not configured');
    error.code = 'PRIVACY_AUDIT_NOT_CONFIGURED';
    throw error;
  }
  return key;
};

const hashIdempotencyKey = ({ subjectUser, idempotencyKey }) => {
  const normalized = String(idempotencyKey || '').trim();
  if (!normalized) return null;
  if (!/^[a-zA-Z0-9_.:-]{8,128}$/.test(normalized)) {
    const error = new Error('Idempotency-Key must contain 8-128 safe characters');
    error.code = 'PRIVACY_IDEMPOTENCY_KEY_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return crypto
    .createHash('sha256')
    .update(`${String(subjectUser)}:${normalized}`)
    .digest('hex');
};

const stableEvidencePayload = (event) => JSON.stringify({
  id: String(event._id),
  evidenceVersion: event.evidenceVersion,
  eventType: event.eventType,
  actor: event.actor ? String(event.actor) : null,
  actorRole: event.actorRole,
  subjectUser: String(event.subjectUser),
  requestType: event.requestType || null,
  requestId: event.requestId ? String(event.requestId) : null,
  noticeVersion: event.noticeVersion || null,
  consentAction: event.consentAction || null,
  source: event.source,
  fromStatus: event.fromStatus || null,
  toStatus: event.toStatus || null,
  retentionCategory: event.retentionCategory || null,
  policyVersion: event.policyVersion || null,
  idempotencyKeyHash: event.idempotencyKeyHash || null,
  clientIdempotencyKeyHash: event.clientIdempotencyKeyHash || null,
  predecessorEventId: event.predecessorEventId
    ? String(event.predecessorEventId)
    : null,
  transitionIdentityHash: event.transitionIdentityHash || null,
  occurredAt: new Date(event.occurredAt).toISOString(),
});

const calculatePrivacyEvidenceHash = (event, signingKey = requireAuditKey()) => (
  crypto
    .createHmac('sha256', signingKey)
    .update(stableEvidencePayload(event))
    .digest('hex')
);

const verifyPrivacyEventEvidence = (event, {
  signingKey = process.env.AUDIT_LOG_SIGNING_KEY,
} = {}) => {
  const normalizedKey = String(signingKey || '').trim();
  if (normalizedKey.length < 32 || /^REPLACE/i.test(normalizedKey)) {
    return { valid: false, reason: 'missing_signing_key' };
  }
  let expected;
  try {
    expected = calculatePrivacyEvidenceHash(event, normalizedKey);
  } catch {
    return { valid: false, reason: 'invalid_evidence_payload' };
  }
  const actual = String(event?.evidenceHash || '');
  if (
    actual.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) {
    return { valid: false, reason: 'evidence_hash_mismatch' };
  }
  return { valid: true };
};

const OPERATION_IDENTITY_FIELDS = Object.freeze([
  'evidenceVersion',
  'eventType',
  'actor',
  'actorRole',
  'subjectUser',
  'requestType',
  'requestId',
  'noticeVersion',
  'consentAction',
  'source',
  'fromStatus',
  'toStatus',
  'retentionCategory',
  'policyVersion',
  'idempotencyKeyHash',
  'clientIdempotencyKeyHash',
  'predecessorEventId',
  'transitionIdentityHash',
  'occurredAt',
]);

const normalizeOperationValue = (field, value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (field === 'occurredAt') return new Date(value).toISOString();
  if (['actor', 'subjectUser', 'requestId', 'predecessorEventId'].includes(field)) {
    return String(value);
  }
  return value;
};

const verifyPrivacyEventOperation = (event, expected = {}, options = {}) => {
  const evidence = verifyPrivacyEventEvidence(event, options);
  if (!evidence.valid) return evidence;
  if (event?.evidenceVersion !== 'v2') {
    return { valid: false, reason: 'unsupported_evidence_version' };
  }
  if (!expected.eventType || !expected.subjectUser) {
    return { valid: false, reason: 'operation_identity_incomplete' };
  }
  for (const field of OPERATION_IDENTITY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(expected, field)) continue;
    if (
      normalizeOperationValue(field, event?.[field])
      !== normalizeOperationValue(field, expected[field])
    ) {
      return {
        valid: false,
        reason: 'operation_identity_mismatch',
        field,
      };
    }
  }
  return { valid: true };
};

const createPrivacyEventAppender = ({
  PrivacyEventModel = PrivacyEvent,
  mongooseInstance = mongoose,
} = {}) => async ({
  evidenceVersion = 'v2',
  eventType,
  actor = null,
  actorRole,
  subjectUser,
  requestType = null,
  requestId = null,
  noticeVersion = null,
  consentAction = null,
  source,
  fromStatus = null,
  toStatus = null,
  retentionCategory = null,
  policyVersion = null,
  idempotencyKey = null,
  clientIdempotencyKey = null,
  predecessorEventId = null,
  transitionIdentityHash = null,
  occurredAt = new Date(),
  session = null,
}) => {
  const _id = new mongooseInstance.Types.ObjectId();
  const idempotencyKeyHash = hashIdempotencyKey({
    subjectUser,
    idempotencyKey,
  });
  const clientIdempotencyKeyHash = hashIdempotencyKey({
    subjectUser,
    idempotencyKey: clientIdempotencyKey,
  });
  const event = {
    _id,
    evidenceVersion,
    eventType,
    actor,
    actorRole,
    subjectUser,
    requestType,
    requestId,
    noticeVersion,
    consentAction,
    source,
    fromStatus,
    toStatus,
    retentionCategory,
    policyVersion,
    idempotencyKeyHash,
    clientIdempotencyKeyHash,
    predecessorEventId,
    transitionIdentityHash,
    occurredAt,
  };
  const evidenceHash = calculatePrivacyEvidenceHash(event);

  const document = new PrivacyEventModel({
    ...event,
    evidenceHash,
  });
  await document.save(session ? { session } : undefined);
  return document;
};

const appendPrivacyEvent = createPrivacyEventAppender();

module.exports = {
  appendPrivacyEvent,
  calculatePrivacyEvidenceHash,
  createPrivacyEventAppender,
  hashIdempotencyKey,
  stableEvidencePayload,
  verifyPrivacyEventEvidence,
  verifyPrivacyEventOperation,
};
