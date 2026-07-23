const mongoose = require('mongoose');

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const payoutWebhookEventSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['razorpay-x'],
    default: 'razorpay-x',
    required: true,
    immutable: true,
  },
  eventKey: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    maxlength: 256,
    match: /^[A-Za-z0-9:_-]{3,256}$/,
  },
  providerEventId: {
    type: String,
    immutable: true,
    trim: true,
    maxlength: 128,
    match: PROVIDER_ID_PATTERN,
  },
  payloadDigest: {
    type: String,
    required: true,
    immutable: true,
    lowercase: true,
    match: SHA256_PATTERN,
  },
  eventType: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    maxlength: 128,
    match: /^[a-z][a-z0-9._-]{2,127}$/,
  },
  providerPayoutId: {
    type: String,
    trim: true,
    maxlength: 128,
    match: PROVIDER_ID_PATTERN,
    default: null,
    index: true,
  },
  payout: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payout',
    default: null,
    index: true,
  },
  processingState: {
    type: String,
    enum: [
      'received',
      'processing',
      'processed',
      'ignored',
      'needs_review',
      'retryable_failure',
    ],
    default: 'received',
    required: true,
    index: true,
  },
  reconciliationDecision: {
    type: String,
    enum: ['apply', 'already_applied', 'ignore', 'needs_review'],
    default: null,
  },
  mismatchCodes: {
    type: [{
      type: String,
      match: SAFE_CODE_PATTERN,
      maxlength: 64,
    }],
    default: [],
    validate: {
      validator: (codes) => codes.length <= 32,
      message: 'Mismatch code list is too large',
    },
  },
  failureCode: {
    type: String,
    match: SAFE_CODE_PATTERN,
    maxlength: 64,
    default: null,
  },
  deliveryCount: {
    type: Number,
    min: 1,
    default: 1,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Delivery count must be a safe integer',
    },
  },
  identityConflictCount: {
    type: Number,
    min: 0,
    default: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Identity conflict count must be a safe integer',
    },
  },
  lastIdentityConflictAt: {
    type: Date,
    default: null,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    required: true,
    immutable: true,
  },
  lastDeliveryAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  processedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

payoutWebhookEventSchema.index(
  { eventKey: 1 },
  { unique: true, name: 'unique_payout_webhook_event_key' }
);
payoutWebhookEventSchema.index(
  { payloadDigest: 1 },
  { unique: true, name: 'unique_payout_webhook_payload_digest' }
);
payoutWebhookEventSchema.index(
  { providerEventId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_razorpay_x_webhook_event_id',
  }
);
payoutWebhookEventSchema.index({ processingState: 1, receivedAt: 1 });
payoutWebhookEventSchema.index({ providerPayoutId: 1, receivedAt: -1 });

module.exports = mongoose.model('PayoutWebhookEvent', payoutWebhookEventSchema);
