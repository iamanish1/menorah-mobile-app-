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

  // Amount
  amountPaise:  { type: Number, required: true },  // in paise (e.g. 100000 = ₹1000)
  amountRupees: { type: Number, required: true },  // in rupees (e.g. 1000)

  // Razorpay identifiers
  razorpayPayoutId:      { type: String, required: true, unique: true },
  razorpayFundAccountId: { type: String, default: null },
  razorpayContactId:     { type: String, default: null },
  referenceId:           { type: String, index: true },

  // Status — mirrors Razorpay payout lifecycle
  status: {
    type: String,
    enum: ['processing', 'queued', 'pending', 'on_hold', 'processed', 'reversed', 'cancelled', 'failed'],
    default: 'processing',
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
payoutSchema.index({ razorpayPayoutId: 1 }, { unique: true });
payoutSchema.index({ referenceId: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
