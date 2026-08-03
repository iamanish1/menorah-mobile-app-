const mongoose = require('mongoose');

const REQUEST_TYPES = Object.freeze(['export', 'correction', 'grievance']);
const REQUEST_STATUSES = Object.freeze([
  'submitted',
  'under_review',
  'action_required',
  'completed',
  'rejected',
  'cancelled',
]);

const privacyRightsRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  requestType: {
    type: String,
    enum: REQUEST_TYPES,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: REQUEST_STATUSES,
    required: true,
    default: 'submitted',
    index: true,
  },
  workflowVersion: {
    type: Number,
    default: 1,
    min: 1,
    required: true,
  },
  activeKey: {
    type: String,
    default: null,
    select: false,
    match: /^[a-f0-9]{64}$/,
  },
  idempotencyKeyHash: {
    type: String,
    default: null,
    select: false,
    match: /^[a-f0-9]{64}$/,
  },
  source: {
    type: String,
    required: true,
    maxlength: 64,
    match: /^[a-z0-9_.:-]+$/,
  },
  scope: {
    type: String,
    enum: ['account_data', null],
    default: null,
  },
  correctionFields: [{
    type: String,
    enum: [
      'name',
      'date_of_birth',
      'gender',
      'phone',
      'email',
      'address',
      'emergency_contact',
      'other',
    ],
  }],
  contactChannel: {
    type: String,
    enum: ['in_app', 'email'],
    default: 'in_app',
  },
  payloadEncrypted: {
    type: String,
    default: null,
    select: false,
  },
  submittedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  underReviewAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  resolutionEvidenceReference: {
    type: String,
    default: null,
    maxlength: 128,
    match: /^[a-zA-Z0-9_.:/-]+$/,
  },
  legalHold: {
    active: { type: Boolean, default: false },
    setAt: { type: Date, default: null },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    policyReference: { type: String, default: null, maxlength: 256 },
    releasedAt: { type: Date, default: null },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  retention: {
    category: {
      type: String,
      default: 'privacy_rights_request_payload',
      immutable: true,
    },
    policyVersion: { type: String, default: null, maxlength: 128 },
    dueAt: { type: Date, default: null, index: true },
    payloadDisposedAt: { type: Date, default: null },
  },
}, {
  timestamps: true,
});

privacyRightsRequestSchema.index(
  { activeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeKey: { $type: 'string' } },
    name: 'privacy_request_active_unique_v1',
  }
);
privacyRightsRequestSchema.index(
  { idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: 'string' } },
    name: 'privacy_request_idempotency_unique_v1',
  }
);
privacyRightsRequestSchema.index({
  status: 1,
  'legalHold.active': 1,
  'retention.dueAt': 1,
  _id: 1,
}, { name: 'privacy_request_retention_sweep_v1' });

privacyRightsRequestSchema.pre('validate', function requireInitialEncryptedPayload(next) {
  if (this.isNew && !this.payloadEncrypted) {
    this.invalidate(
      'payloadEncrypted',
      'An encrypted request payload is required when the request is created'
    );
  }
  next();
});

module.exports = mongoose.model('PrivacyRightsRequest', privacyRightsRequestSchema);
module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
module.exports.REQUEST_TYPES = REQUEST_TYPES;
