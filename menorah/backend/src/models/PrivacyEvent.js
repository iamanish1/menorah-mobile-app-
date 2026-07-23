const mongoose = require('mongoose');

const EVENT_TYPES = Object.freeze([
  'privacy_notice_accepted',
  'privacy_notice_withdrawn',
  'account_deletion_requested',
  'rights_request_submitted',
  'rights_request_status_changed',
  'deletion_request_status_changed',
  'legal_hold_applied',
  'legal_hold_released',
  'retention_payload_disposed',
  'legacy_deletion_request_registered',
]);

const privacyEventSchema = new mongoose.Schema({
  evidenceVersion: {
    type: String,
    enum: ['v2'],
    required: true,
    default: 'v2',
    immutable: true,
  },
  eventType: {
    type: String,
    enum: EVENT_TYPES,
    required: true,
    index: true,
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  actorRole: {
    type: String,
    enum: ['user', 'counsellor', 'admin', 'system'],
    required: true,
  },
  subjectUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  requestType: {
    type: String,
    enum: ['export', 'correction', 'grievance', 'deletion'],
    default: null,
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  noticeVersion: {
    type: String,
    default: null,
    maxlength: 128,
  },
  consentAction: {
    type: String,
    enum: ['accepted', 'withdrawn', null],
    default: null,
  },
  source: {
    type: String,
    required: true,
    maxlength: 64,
    match: /^[a-z0-9_.:-]+$/,
  },
  fromStatus: {
    type: String,
    default: null,
    maxlength: 64,
  },
  toStatus: {
    type: String,
    default: null,
    maxlength: 64,
  },
  retentionCategory: {
    type: String,
    default: null,
    maxlength: 64,
  },
  policyVersion: {
    type: String,
    default: null,
    maxlength: 128,
  },
  idempotencyKeyHash: {
    type: String,
    default: null,
    select: false,
    match: /^[a-f0-9]{64}$/,
  },
  clientIdempotencyKeyHash: {
    type: String,
    default: null,
    select: false,
    match: /^[a-f0-9]{64}$/,
  },
  predecessorEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrivacyEvent',
    default: null,
    index: true,
  },
  transitionIdentityHash: {
    type: String,
    default: null,
    match: /^[a-f0-9]{64}$/,
  },
  evidenceHash: {
    type: String,
    required: true,
    immutable: true,
    match: /^[a-f0-9]{64}$/,
  },
  occurredAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
});

privacyEventSchema.index({ subjectUser: 1, eventType: 1, occurredAt: -1, _id: -1 });
privacyEventSchema.index(
  { idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: 'string' } },
    name: 'privacy_event_idempotency_unique_v1',
  }
);
privacyEventSchema.index(
  { clientIdempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { clientIdempotencyKeyHash: { $type: 'string' } },
    name: 'privacy_event_client_idempotency_unique_v2',
  }
);
privacyEventSchema.index(
  { transitionIdentityHash: 1 },
  {
    unique: true,
    partialFilterExpression: { transitionIdentityHash: { $type: 'string' } },
    name: 'privacy_event_transition_identity_unique_v2',
  }
);

const rejectMutation = function rejectPrivacyEventMutation(next) {
  const error = new Error('Privacy audit events are append-only');
  error.code = 'PRIVACY_EVENT_APPEND_ONLY';
  next(error);
};

[
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
].forEach((operation) => privacyEventSchema.pre(operation, rejectMutation));

privacyEventSchema.pre(
  'deleteOne',
  { document: true, query: false },
  rejectMutation
);
privacyEventSchema.pre('bulkWrite', rejectMutation);
privacyEventSchema.pre('insertMany', rejectMutation);

privacyEventSchema.pre('save', function preventExistingEventMutation(next) {
  if (!this.isNew) return rejectMutation.call(this, next);
  return next();
});

module.exports = mongoose.model('PrivacyEvent', privacyEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
