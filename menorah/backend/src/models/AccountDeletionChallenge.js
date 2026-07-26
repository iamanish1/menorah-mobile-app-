const mongoose = require('mongoose');

const accountDeletionChallengeSchema = new mongoose.Schema({
  challengeId: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    match: /^[a-f0-9]{64}$/,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
    index: true,
  },
  method: {
    type: String,
    enum: ['apple'],
    required: true,
    immutable: true,
  },
  purpose: {
    type: String,
    enum: ['account-deletion'],
    default: 'account-deletion',
    immutable: true,
  },
  nonceHash: {
    type: String,
    required: true,
    immutable: true,
    select: false,
    match: /^[a-f0-9]{64}$/,
  },
  sessionVersion: {
    type: Number,
    required: true,
    immutable: true,
    min: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    immutable: true,
  },
  consumedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

accountDeletionChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountDeletionChallengeSchema.index({ user: 1, method: 1, consumedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('AccountDeletionChallenge', accountDeletionChallengeSchema);
