const mongoose = require('mongoose');

const dataDeletionRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'completed', 'rejected'],
    default: 'pending',
    index: true,
  },
  requestedAt: { type: Date, default: Date.now, required: true },
  accountDeactivatedAt: { type: Date, required: true },
  retentionReviewAfter: { type: Date, required: true },
  legalHold: { type: Boolean, default: false },
  legalHoldSetAt: { type: Date, default: null },
  legalHoldSetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  legalHoldPolicyReference: { type: String, default: null, maxlength: 256 },
  legalHoldReleasedAt: { type: Date, default: null },
  legalHoldReleasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  workflowVersion: { type: Number, default: 1, min: 1 },
  underReviewAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionEvidenceReference: {
    type: String,
    default: null,
    maxlength: 128,
    match: /^[a-zA-Z0-9_.:/-]+$/,
  },
  // Retained only for compatibility with pre-workflow records. New workflows
  // use bounded evidence references and never return these notes to clients.
  reviewNotes: { type: String, default: '', maxlength: 1000, select: false },
}, { timestamps: true });

dataDeletionRequestSchema.index({ status: 1, retentionReviewAfter: 1 });
dataDeletionRequestSchema.index(
  { status: 1, legalHold: 1, retentionReviewAfter: 1, _id: 1 },
  { name: 'deletion_request_review_queue_v1' }
);

module.exports = mongoose.model('DataDeletionRequest', dataDeletionRequestSchema);
