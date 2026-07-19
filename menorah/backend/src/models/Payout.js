const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  // Relations
  counsellor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Counsellor',
    required: true,
    index: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: { type: Date, default: null },
  approvalExpiresAt: { type: Date, default: null },

  // Amount
  amountPaise:  { type: Number, required: true },  // in paise (e.g. 100000 = ₹1000)
  amountRupees: { type: Number, required: true },  // in rupees (e.g. 1000)

  // Razorpay identifiers
  // A payout is first created as an approval request. Razorpay identifiers are
  // assigned only after a different administrator approves it.
  razorpayPayoutId:      { type: String, default: null },
  razorpayFundAccountId: { type: String, default: null },
  razorpayContactId:     { type: String, default: null },
  referenceId:           { type: String, index: true },

  // Status — mirrors Razorpay payout lifecycle
  status: {
    type: String,
    enum: ['awaiting_approval', 'processing', 'queued', 'pending', 'on_hold', 'processed', 'reversed', 'cancelled', 'failed', 'rejected', 'expired'],
    default: 'awaiting_approval',
    index: true
  },

  // Bank details snapshot at time of payout (audit trail)
  bankDetailsSnapshot: {
    accountNumberMasked: String,  // e.g. "···4321"
    ifscCode:            String,
    accountHolderName:   String,
    bankName:            String
  },

  // Metadata
  notes:         { type: String, default: '' },
  failureReason: { type: String, default: null },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
    immutable: true,
    trim: true,
    maxlength: 128
  },

  // UTR (Unique Transaction Reference) — filled when processed
  utr: { type: String, default: null },

  // Webhook tracking
  lastWebhookAt:  { type: Date, default: null },
  webhookEventId: { type: String, default: null },
}, {
  timestamps: true
});

// Compound indexes for common queries
payoutSchema.index({ counsellor: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index(
  { razorpayPayoutId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayPayoutId: { $type: 'string' } },
  }
);
payoutSchema.index({ approvalExpiresAt: 1, status: 1 });
payoutSchema.index(
  { counsellor: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['awaiting_approval', 'processing', 'queued', 'pending', 'on_hold'] },
    },
    name: 'one_active_payout_per_counsellor',
  }
);

module.exports = mongoose.model('Payout', payoutSchema);
