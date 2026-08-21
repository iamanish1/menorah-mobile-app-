const mongoose = require('mongoose');

const paymentReceiptSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  orderId: {
    type: String,
    required: true,
    trim: true,
  },
  purpose: {
    type: String,
    enum: ['booking', 'subscription'],
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
  },
  amount: Number,
  currency: String,
}, {
  timestamps: true,
});

paymentReceiptSchema.index({ orderId: 1 });
paymentReceiptSchema.index({ user: 1, createdAt: -1 });
paymentReceiptSchema.index({ purpose: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentReceipt', paymentReceiptSchema);
