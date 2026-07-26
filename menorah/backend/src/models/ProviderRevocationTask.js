const mongoose = require('mongoose');

const providerRevocationTaskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  deletionRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DataDeletionRequest',
    required: true,
    immutable: true,
  },
  provider: {
    type: String,
    enum: ['apple'],
    required: true,
    immutable: true,
  },
  clientId: {
    type: String,
    required: true,
    immutable: true,
    select: false,
  },
  refreshTokenEncrypted: {
    type: String,
    required: true,
    select: false,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'retry', 'completed', 'manual_review'],
    default: 'pending',
    index: true,
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  lockedUntil: {
    type: Date,
    default: null,
  },
  lockTokenHash: {
    type: String,
    default: null,
    select: false,
  },
  lastErrorCode: {
    type: String,
    default: null,
    match: /^[A-Z0-9_]{1,64}$/,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

providerRevocationTaskSchema.index({ user: 1, provider: 1 }, { unique: true });
providerRevocationTaskSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });

module.exports = mongoose.model('ProviderRevocationTask', providerRevocationTaskSchema);
