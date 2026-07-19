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
  completedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewNotes: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });

dataDeletionRequestSchema.index({ status: 1, retentionReviewAfter: 1 });

module.exports = mongoose.model('DataDeletionRequest', dataDeletionRequestSchema);
