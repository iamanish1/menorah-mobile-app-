const mongoose = require('mongoose');

const kycVerificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'manual_review', 'rejected'],
    default: 'pending',
    index: true,
  },
  provider: {
    type: String,
    enum: ['luxand.cloud'],
    default: 'luxand.cloud',
  },
  checkType: {
    type: String,
    enum: ['face_detection'],
    default: 'face_detection',
  },
  consentAccepted: {
    type: Boolean,
    required: true,
  },
  consentVersion: {
    type: String,
    required: true,
    default: 'legacy',
    maxlength: 64,
  },
  consentAcceptedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  verifiedAt: Date,
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewReason: String,
  failureReason: String,
  faceCheck: {
    faceCount: Number,
    confidence: Number,
    threshold: Number,
  },
  providerRequestId: String,
  // KYC records are retained only for the approved policy period. A scheduled
  // deletion workflow must honour legal holds before purging these records.
  retentionExpiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  legalHold: {
    type: Boolean,
    default: false,
    index: true,
  },
  legalHoldSetAt: { type: Date, default: null },
  legalHoldReason: { type: String, default: '', maxlength: 500 },
  metadata: {
    selfieMimeType: String,
    originalSelfieMimeType: String,
    originalSelfieSize: Number,
    normalizedSelfieSize: Number,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

kycVerificationSchema.index({ user: 1, createdAt: -1 });
kycVerificationSchema.index({ status: 1, createdAt: -1 });
kycVerificationSchema.index({ legalHold: 1, retentionExpiresAt: 1 });
module.exports = mongoose.model('KycVerification', kycVerificationSchema);
