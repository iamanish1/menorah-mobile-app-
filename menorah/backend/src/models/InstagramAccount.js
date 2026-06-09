const mongoose = require('mongoose');

const instagramAccountSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  igUserId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  pageId: {
    type: String,
    default: '',
    trim: true
  },
  username: {
    type: String,
    default: '',
    trim: true
  },
  accountType: {
    type: String,
    default: 'BUSINESS',
    trim: true
  },
  accessTokenEncrypted: {
    type: String,
    required: true,
    select: false
  },
  tokenExpiresAt: {
    type: Date,
    default: null
  },
  connectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['connected', 'expired', 'revoked', 'error'],
    default: 'connected',
    index: true
  },
  lastVerifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

instagramAccountSchema.index({ igUserId: 1, status: 1 });

module.exports = mongoose.model('InstagramAccount', instagramAccountSchema);
