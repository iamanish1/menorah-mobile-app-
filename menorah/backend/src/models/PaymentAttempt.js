const mongoose = require('mongoose');

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const OBJECT_ID_STRING_PATTERN = /^[a-fA-F0-9]{24}$/;
const EVENT_KEY_PATTERN = /^[A-Za-z0-9:_-]{3,256}$/;
const NON_REPLACEABLE_ATTEMPT_STATUSES = Object.freeze([
  'creating',
  'order_created',
  'payment_pending',
  'payment_failed',
  'captured',
  'needs_review',
]);

const paymentAttemptSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['razorpay'],
    default: 'razorpay',
    required: true,
    immutable: true,
  },
  purpose: {
    type: String,
    enum: ['booking'],
    default: 'booking',
    required: true,
    immutable: true,
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    immutable: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  orderId: {
    type: String,
    trim: true,
    maxlength: 128,
    match: PROVIDER_ID_PATTERN,
  },
  paymentId: {
    type: String,
    trim: true,
    maxlength: 128,
    match: PROVIDER_ID_PATTERN,
  },
  expected: {
    amountMinor: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Expected amount in minor units must be a safe integer',
      },
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      enum: ['INR'],
    },
    receipt: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 40,
    },
    notes: {
      bookingId: {
        type: String,
        required: true,
        immutable: true,
        match: OBJECT_ID_STRING_PATTERN,
      },
      userId: {
        type: String,
        required: true,
        immutable: true,
        match: OBJECT_ID_STRING_PATTERN,
      },
    },
  },
  status: {
    type: String,
    enum: [
      'creating',
      'order_created',
      'payment_pending',
      'payment_failed',
      'captured',
      'expired',
      'needs_review',
    ],
    default: 'creating',
    required: true,
    index: true,
  },
  providerCreatedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  capturedAt: {
    type: Date,
    default: null,
  },
  failedAt: {
    type: Date,
    default: null,
  },
  reconciliation: {
    lastDecision: {
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
    lastSource: {
      type: String,
      enum: ['webhook', 'redirect_verification', 'reconciliation_job'],
      default: null,
    },
    lastEventKey: {
      type: String,
      trim: true,
      maxlength: 256,
      match: EVENT_KEY_PATTERN,
      default: null,
    },
    providerOrderStatus: {
      type: String,
      enum: ['created', 'attempted', 'paid'],
      default: null,
    },
    providerPaymentStatus: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'refunded', 'failed'],
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
  },
}, {
  timestamps: true,
  strict: 'throw',
});

paymentAttemptSchema.pre('validate', function(next) {
  const orderRequiredStatuses = new Set([
    'order_created',
    'payment_pending',
    'payment_failed',
    'captured',
    'expired',
  ]);

  if (orderRequiredStatuses.has(this.status)) {
    if (!this.orderId) {
      this.invalidate('orderId', 'Provider order ID is required for this lifecycle state');
    }
    if (!this.providerCreatedAt) {
      this.invalidate(
        'providerCreatedAt',
        'Provider creation time is required for this lifecycle state'
      );
    }
  }

  if (this.status === 'captured' && !this.paymentId) {
    this.invalidate('paymentId', 'Captured attempts require a payment ID');
  }
  if (this.paymentId && this.status !== 'captured') {
    this.invalidate('status', 'A payment ID may only be bound to a captured attempt');
  }

  next();
});

paymentAttemptSchema.index(
  { booking: 1 },
  {
    unique: true,
    name: 'one_nonreplaceable_payment_attempt_per_booking',
    partialFilterExpression: {
      status: { $in: [...NON_REPLACEABLE_ATTEMPT_STATUSES] },
    },
  }
);
paymentAttemptSchema.index(
  { 'expected.receipt': 1 },
  { unique: true, name: 'unique_razorpay_booking_receipt' }
);
paymentAttemptSchema.index(
  { orderId: 1 },
  { unique: true, sparse: true, name: 'unique_razorpay_booking_order' }
);
paymentAttemptSchema.index(
  { paymentId: 1 },
  { unique: true, sparse: true, name: 'unique_captured_razorpay_payment' }
);
paymentAttemptSchema.index({ user: 1, createdAt: -1 });
paymentAttemptSchema.index({ status: 1, expiresAt: 1 });

paymentAttemptSchema.statics.getNonReplaceableStatuses = () =>
  [...NON_REPLACEABLE_ATTEMPT_STATUSES];

module.exports = mongoose.model('PaymentAttempt', paymentAttemptSchema);
