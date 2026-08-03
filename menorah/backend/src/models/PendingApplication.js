const mongoose = require('mongoose');
const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  COUNSELLOR_CONSENT_SOURCES,
  CURRENT_APPLICATION_IDENTITY_STATES,
  LEGACY_PROFESSIONAL_VERIFICATION_STATES,
  PROFESSIONAL_VERIFICATION_STATES,
} = require('../config/counsellorVerification');

const hasUniqueObjectIds = (values) => (
  Array.isArray(values)
  && values.every((value) => value != null)
  && new Set(values.map((value) => value.toString())).size === values.length
);

const adminHistoryActorRequired = function adminHistoryActorRequired() {
  return this.actorType === 'admin';
};

const systemHistoryHasNoActor = function systemHistoryHasNoActor(value) {
  return this.actorType !== 'system' || value == null;
};

const onboardingConsentSchema = new mongoose.Schema({
  accepted: { type: Boolean, default: false },
  version: { type: String, default: null, trim: true, maxlength: 128 },
  acceptedAt: { type: Date, default: null },
  source: {
    type: String,
    enum: COUNSELLOR_CONSENT_SOURCES,
    default: null,
  },
}, { _id: false });

const evidenceReviewSchema = new mongoose.Schema({
  decision: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  policyVersion: { type: String, default: null, trim: true, maxlength: 128 },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: { type: Date, default: null },
  reason: { type: String, default: null, trim: true, maxlength: 1000 },
}, { _id: false });

const credentialEvidenceSchema = new mongoose.Schema({
  reference: {
    type: String,
    required: true,
    trim: true,
    maxlength: 512,
    select: false,
  },
  category: { type: String, required: true, trim: true, maxlength: 100 },
  sha256: {
    type: String,
    default: null,
    lowercase: true,
    trim: true,
    match: /^[a-f0-9]{64}$/,
  },
  contentType: {
    type: String,
    default: null,
    trim: true,
    maxlength: 100,
    validate: {
      validator: (value) => value == null || value.trim().length > 0,
      message: 'Evidence content type cannot be empty',
    },
  },
  sizeBytes: {
    type: Number,
    default: null,
    min: 1,
    validate: {
      validator: (value) => value == null || Number.isSafeInteger(value),
      message: 'Evidence size must be a safe integer',
    },
  },
  submittedAt: { type: Date, required: true },
  source: { type: String, required: true, trim: true, maxlength: 64 },
  review: {
    type: evidenceReviewSchema,
    default: () => ({}),
  },
}, { timestamps: false });

const aggregateCredentialReviewSchema = new mongoose.Schema({
  decision: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  policyVersion: { type: String, default: null, trim: true, maxlength: 128 },
  evidenceIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
    validate: {
      validator: hasUniqueObjectIds,
      message: 'Credential review evidence IDs must be unique',
    },
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: { type: Date, default: null },
}, { _id: false });

const reviewAccountSnapshotSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'counsellor'],
    required: true,
  },
  isActive: { type: Boolean, required: true },
  sessionVersion: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Review account session version must be a safe integer',
    },
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32,
  },
  capturedAt: { type: Date, required: true },
}, { _id: false });

const reverificationAuthorizationSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    select: false,
    lowercase: true,
    trim: true,
    match: /^[a-f0-9]{64}$/,
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  issuedAt: { type: Date, required: true },
  expiresAt: {
    type: Date,
    required: true,
    validate: {
      validator(value) {
        return value instanceof Date
          && this.issuedAt instanceof Date
          && value > this.issuedAt;
      },
      message: 'Re-verification authorization expiry must be after issuance',
    },
  },
  consentVersion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
  },
  redeemedAt: {
    type: Date,
    required: true,
    validate: {
      validator(value) {
        return value instanceof Date
          && this.issuedAt instanceof Date
          && this.expiresAt instanceof Date
          && value >= this.issuedAt
          && value < this.expiresAt;
      },
      message: 'Re-verification authorization must be redeemed while valid',
    },
  },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  // `from` is intentionally not enum-constrained so migration history can
  // preserve the retired `pending` value.
  from: { type: String, default: null, maxlength: 64 },
  to: {
    type: String,
    enum: PROFESSIONAL_VERIFICATION_STATES,
    required: true,
  },
  at: { type: Date, required: true },
  actorType: {
    type: String,
    enum: ['applicant', 'admin', 'system'],
    required: true,
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    required: adminHistoryActorRequired,
    validate: {
      validator: systemHistoryHasNoActor,
      message: 'System status history entries cannot name a user actor',
    },
  },
  reason: { type: String, default: null, maxlength: 1000 },
}, { _id: false });

const pendingApplicationSchema = new mongoose.Schema({
  firstName:      { type: String, trim: true },
  lastName:       { type: String, trim: true },
  email:          { type: String, lowercase: true, trim: true, index: true },
  phone:          { type: String, trim: true },
  dateOfBirth:    { type: Date },
  gender:         { type: String },
  licenseNumber:  { type: String, trim: true },
  specialization: { type: String, trim: true },
  specializations:{ type: [String], default: [] },
  experience:     { type: Number },
  bio:            { type: String },
  languages:      { type: [String], default: [] },
  hourlyRate:     { type: Number },
  currency:       { type: String, default: 'INR' },
  education:      { type: mongoose.Schema.Types.Mixed, default: [] },
  certifications: { type: mongoose.Schema.Types.Mixed, default: [] },
  availability:   { type: mongoose.Schema.Types.Mixed },
  statusLookupTokenHash: { type: String, select: false, index: true, unique: true, sparse: true },
  status: {
    type: String,
    enum: [
      ...PROFESSIONAL_VERIFICATION_STATES,
      ...LEGACY_PROFESSIONAL_VERIFICATION_STATES,
      // Transitional compatibility for applications quarantined by the
      // identity-conflict migration before the verification lifecycle shipped.
      'manual_review',
    ],
    default: 'submitted',
    index: true,
  },
  onboardingConsent: {
    type: onboardingConsentSchema,
    default: () => ({}),
  },
  credentialEvidence: {
    type: [credentialEvidenceSchema],
    default: [],
  },
  credentialReview: {
    type: aggregateCredentialReviewSchema,
    default: () => ({}),
  },
  reviewStartedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewStartedAt: { type: Date, default: null },
  decisionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  decisionAt: { type: Date, default: null },
  decisionReason: { type: String, default: null, trim: true, maxlength: 1000 },
  verificationExpiresAt: { type: Date, default: null },
  linkedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  linkedCounsellor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Counsellor',
    default: null,
  },
  reviewAccountSnapshot: {
    type: reviewAccountSnapshotSchema,
    default: undefined,
    select: false,
  },
  reverificationAuthorization: {
    type: reverificationAuthorizationSchema,
    default: undefined,
    select: false,
    immutable: true,
  },
  supersedesApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PendingApplication',
    default: null,
  },
  legacyReviewRequired: { type: Boolean, default: false },
  lifecycleSchemaVersion: { type: Number, default: 1, min: 1 },
  legacyMigrationVersion: { type: String, default: null },
  statusHistory: {
    type: [statusHistorySchema],
    default: [],
  },
  identityConflict: {
    hasConflict: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    phone: { type: Boolean, default: false },
    detectedAt: { type: Date, default: null },
  },
  rejectionReason:{ type: String, default: null },
  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:     { type: Date, default: null },
}, { timestamps: true });

const currentApplicationIdentityFilter = {
  status: { $in: [...CURRENT_APPLICATION_IDENTITY_STATES] },
  legacyReviewRequired: false,
};
pendingApplicationSchema.index(
  { email: 1, legacyReviewRequired: 1 },
  {
    name: 'current_application_email_unique_v1',
    unique: true,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
    partialFilterExpression: {
      ...currentApplicationIdentityFilter,
      email: { $type: 'string' },
    },
  }
);
pendingApplicationSchema.index(
  { licenseNumber: 1, legacyReviewRequired: 1 },
  {
    name: 'current_application_license_unique_v1',
    unique: true,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
    partialFilterExpression: {
      ...currentApplicationIdentityFilter,
      licenseNumber: { $type: 'string' },
    },
  }
);

module.exports = mongoose.model('PendingApplication', pendingApplicationSchema);
