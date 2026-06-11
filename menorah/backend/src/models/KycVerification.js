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

module.exports = mongoose.model('KycVerification', kycVerificationSchema);
