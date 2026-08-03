const mongoose = require('mongoose');

const pushReceiptSchema = new mongoose.Schema({
  receiptId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
    select: false,
  },
  notification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PushNotification',
    required: true,
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PushDevice',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending',
    required: true,
  },
  availableAt: {
    type: Date,
    required: true,
  },
  checkedAt: {
    type: Date,
    default: null,
  },
  attempts: {
    type: Number,
    min: 0,
    max: 10,
    default: 0,
  },
  lastErrorCode: {
    type: String,
    trim: true,
    maxlength: 80,
    default: null,
    select: false,
  },
}, {
  timestamps: true,
  versionKey: false,
});

pushReceiptSchema.index(
  { receiptId: 1 },
  { unique: true, name: 'push_receipt_id_unique_v1' }
);
pushReceiptSchema.index(
  { status: 1, availableAt: 1 },
  { name: 'push_receipt_pending_v1' }
);
pushReceiptSchema.index(
  { device: 1, createdAt: -1 },
  { name: 'push_receipt_device_v1' }
);

module.exports = mongoose.model('PushReceipt', pushReceiptSchema);
