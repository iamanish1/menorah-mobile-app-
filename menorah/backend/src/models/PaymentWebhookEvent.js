const mongoose = require('mongoose');

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const EVENT_KEY_PATTERN = /^[A-Za-z0-9:_-]{3,256}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

const paymentWebhookEventSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['razorpay'],
    default: 'razorpay',
    required: true,
    immutable: true,
  },
  eventKey: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    maxlength: 256,
    match: EVENT_KEY_PATTERN,
  },
  providerEventId: {
    // Populated from x-razorpay-event-id. Razorpay signs the raw body, not this
    // header, so payloadDigest remains the authoritative replay identity.
    type: String,
    immutable: true,
    trim: true,
    maxlength: 128,
    match: PROVIDER_ID_PATTERN,
  },
  payloadDigest: {
    // SHA-256 of the unchanged, signature-verified raw request bytes.
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
  subject: {
    orderId: {
      type: String,
      trim: true,
      maxlength: 128,
      match: PROVIDER_ID_PATTERN,
      default: null,
    },
    paymentId: {
      type: String,
      trim: true,
      maxlength: 128,
      match: PROVIDER_ID_PATTERN,
      default: null,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    paymentAttempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentAttempt',
      default: null,
    },
  },
  reconciliationDecision: {
    type: String,
    enum: ['authorize', 'already_applied', 'reject', 'needs_review'],
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
      validator: (codes) => codes.length <= 64,
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
    validate: {
      validator: Number.isSafeInteger,
      message: 'Delivery count must be a safe integer',
    },
    default: 1,
  },
  processingAttempts: {
    type: Number,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Processing attempts must be a safe integer',
    },
    default: 0,
  },
  identityConflictCount: {
    type: Number,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Identity conflict count must be a safe integer',
    },
    default: 0,
  },
  receivedAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
  processingStartedAt: {
    type: Date,
    default: null,
  },
  lastAttemptAt: {
    type: Date,
    default: null,
  },
  processedAt: {
    type: Date,
    default: null,
  },
  nextRetryAt: {
    type: Date,
    default: null,
  },
  lastIdentityConflictAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

paymentWebhookEventSchema.index(
  { eventKey: 1 },
  { unique: true, name: 'unique_payment_webhook_event_key' }
);
paymentWebhookEventSchema.index(
  { payloadDigest: 1 },
  { unique: true, name: 'unique_payment_webhook_payload_digest' }
);
paymentWebhookEventSchema.index(
  { providerEventId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_razorpay_webhook_event_id',
  }
);
paymentWebhookEventSchema.index({ processingState: 1, receivedAt: 1 });
paymentWebhookEventSchema.index({ processingState: 1, nextRetryAt: 1 });
paymentWebhookEventSchema.index({ 'subject.orderId': 1, receivedAt: -1 });

module.exports = mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
