const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  // Basic booking information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  counsellor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Counsellor',
    required: false
  },
  // User preferences for counsellor matching (used when counsellor not assigned yet)
  preferences: {
    gender: {
      type: String,
      enum: ['male', 'female', 'any'],
      default: 'any'
    },
    sessionType: String, // Store the session type preference
    categoryId: String // Store the category (basic, premium, pro, elite)
  },
  // Timestamp when counsellor was assigned
  assignedAt: {
    type: Date
  },
  sessionType: {
    type: String,
    enum: ['video', 'audio', 'chat'],
    default: 'video'
  },
  sessionDuration: {
    type: Number,
    required: true,
    min: 15,
    max: 180 // minutes
  },

  // Scheduling
  scheduledAt: {
    type: Date,
    required: true
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'],
    default: 'pending'
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Payment information
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'razorpay', 'wallet'],
    required: true
  },
  paymentId: String,
  transactionId: String,
  // Razorpay specific fields
  razorpayOrderId: String,
  orderStatus: {
    type: String,
    enum: ['created', 'attempted', 'paid', 'failed', 'expired'],
    default: null
  },
  orderCreatedAt: Date,
  paymentAttemptedAt: Date,

  // Session details
  sessionNotes: {
    userNotes: String,
    counsellorNotes: String,
    privateNotes: String // Only visible to counsellor
  },
  symptoms: [String],
  concerns: String,
  goals: [String],

  // Video call information
  videoCall: {
    roomId: String,
    roomUrl: String,
    startTime: Date,
    endTime: Date,
    duration: Number, // actual duration in minutes
    recordingUrl: String,
    isRecordingEnabled: {
      type: Boolean,
      default: false
    }
  },

  // Chat information
  chat: {
    roomId: String,
    messageCount: {
      type: Number,
      default: 0
    },
    lastMessageAt: Date
  },

  // Cancellation and rescheduling
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  rescheduledFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  rescheduledTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },

  // Reminders and notifications
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'push']
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending'
    }
  }],

  // Rating and feedback
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    text: String,
    submittedAt: Date,
    isPublic: {
      type: Boolean,
      default: true
    }
  },

  // Emergency and safety
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  safetyCheck: {
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    concerns: [String]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for session date
bookingSchema.virtual('sessionDate').get(function() {
  return this.scheduledAt.toDateString();
});

// Virtual for session time
bookingSchema.virtual('sessionTime').get(function() {
  return this.scheduledAt.toTimeString().slice(0, 5);
});

// Virtual for is upcoming
bookingSchema.virtual('isUpcoming').get(function() {
  return this.scheduledAt > new Date() && this.status === 'confirmed';
});

// Virtual for is past
bookingSchema.virtual('isPast').get(function() {
  return this.scheduledAt < new Date();
});

// Virtual for can be cancelled
bookingSchema.virtual('canBeCancelled').get(function() {
  const now = new Date();
  const sessionTime = new Date(this.scheduledAt);
  const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
  
  return this.status === 'confirmed' && hoursUntilSession > 24;
});

// Virtual for can be rescheduled
bookingSchema.virtual('canBeRescheduled').get(function() {
  const now = new Date();
  const sessionTime = new Date(this.scheduledAt);
  const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
  
  return this.status === 'confirmed' && hoursUntilSession > 2;
});

// Indexes
bookingSchema.index({ user: 1, scheduledAt: -1 });
bookingSchema.index({ counsellor: 1, scheduledAt: -1 });
bookingSchema.index({ status: 1, scheduledAt: 1 });
bookingSchema.index({ paymentStatus: 1 });
bookingSchema.index({ 'videoCall.roomId': 1 });

// Pre-save middleware to update status history
bookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date()
    });
  }
  next();
});

// Static method to find upcoming bookings
bookingSchema.statics.findUpcoming = function(userId, limit = 10) {
  return this.find({
    user: userId,
    scheduledAt: { $gt: new Date() },
    status: { $in: ['confirmed', 'pending'] }
  })
  .populate('counsellor', 'user specialization hourlyRate')
  .populate('counsellor.user', 'firstName lastName profileImage')
  .sort({ scheduledAt: 1 })
  .limit(limit);
};

// Static method to find past bookings
bookingSchema.statics.findPast = function(userId, limit = 10) {
  return this.find({
    user: userId,
    scheduledAt: { $lt: new Date() },
    status: { $in: ['completed', 'cancelled', 'no-show'] }
  })
  .populate('counsellor', 'user specialization rating')
  .populate('counsellor.user', 'firstName lastName profileImage')
  .sort({ scheduledAt: -1 })
  .limit(limit);
};

// Method to cancel booking
bookingSchema.methods.cancel = function(reason, cancelledBy) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.cancelledAt = new Date();
  return this.save();
};

// Method to complete booking
bookingSchema.methods.complete = function() {
  this.status = 'completed';
  if (this.videoCall && this.videoCall.startTime) {
    this.videoCall.endTime = new Date();
    this.videoCall.duration = Math.round(
      (this.videoCall.endTime - this.videoCall.startTime) / (1000 * 60)
    );
  }
  return this.save();
};

// Method to start session
bookingSchema.methods.startSession = function() {
  this.status = 'in-progress';
  if (this.videoCall) {
    this.videoCall.startTime = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('Booking', bookingSchema);
