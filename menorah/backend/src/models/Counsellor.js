const mongoose = require('mongoose');

const counsellorSchema = new mongoose.Schema({
  // Basic information
  applicationStatusTokenHash: {
    type: String,
    select: false,
    index: true,
    unique: true,
    sparse: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  licenseNumber: {
    type: String,
    required: [true, 'License number is required'],
    unique: true,
    trim: true
  },
  specialization: {
    type: String,
    required: [true, 'Specialization is required'],
    trim: true
  },
  specializations: [{
    type: String,
    trim: true
  }],
  experience: {
    type: Number,
    required: [true, 'Years of experience is required'],
    min: [0, 'Experience cannot be negative']
  },
  education: [{
    degree: String,
    institution: String,
    year: Number,
    description: String
  }],
  certifications: [{
    name: String,
    issuingBody: String,
    year: Number,
    expiryDate: Date
  }],

  // Professional details
  bio: {
    type: String,
    required: [true, 'Bio is required'],
    maxlength: [1000, 'Bio cannot exceed 1000 characters']
  },
  languages: [{
    type: String,
    required: true
  }],
  hourlyRate: {
    type: Number,
    required: [true, 'Hourly rate is required'],
    min: [0, 'Hourly rate cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR'
  },

  // Availability and scheduling
  availability: {
    monday: {
      start: String, // Format: "09:00"
      end: String,   // Format: "17:00"
      isAvailable: { type: Boolean, default: true }
    },
    tuesday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: true }
    },
    wednesday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: true }
    },
    thursday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: true }
    },
    friday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: true }
    },
    saturday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: false }
    },
    sunday: {
      start: String,
      end: String,
      isAvailable: { type: Boolean, default: false }
    }
  },
  sessionDuration: {
    type: Number,
    default: 60, // minutes
    enum: [30, 45, 60, 90, 120]
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },

  // Ratings and reviews
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  totalSessions: {
    type: Number,
    default: 0
  },

  // Media
  profileImage: {
    type: String,
    default: null
  },
  profileImagePublicId: {
    type: String,
    default: null
  },
  profileImageLocalPath: {
    type: String,
    default: null
  },
  voiceIntroUrl: {
    type: String,
    default: null
  },
  voiceIntroPublicId: {
    type: String,
    default: null
  },
  voiceIntroLocalPath: {
    type: String,
    default: null
  },
  voiceIntroDurationSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  profileMediaCompletedAt: {
    type: Date,
    default: null
  },
  gallery: [{
    url: String,
    caption: String,
    type: {
      type: String,
      enum: ['image', 'video']
    }
  }],

  // Verification and status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  verificationDocuments: [{
    type: {
      type: String,
      enum: ['license', 'certification', 'education', 'identity']
    },
    url: String,
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Admin-controlled status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  blockedReason: {
    type: String,
    default: null
  },

  // Payment and commission
  commissionRate: {
    type: Number,
    default: 20, // percentage
    min: 0,
    max: 100
  },
  bankDetails: {
    // Legacy plaintext is selected only by the one-time migration that removes it.
    accountNumber: { type: String, select: false },
    accountNumberEncrypted: { type: String, select: false },
    accountNumberLast4: { type: String, maxlength: 4 },
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },

  // Razorpay payout tracking
  razorpayContactId: { type: String, default: null },
  razorpayFundAccountId: { type: String, default: null },
  lastPayoutAt: { type: Date, default: null },
  lastPayoutAmount: { type: Number, default: 0 },
  totalPaidOut: { type: Number, default: 0 },

  // Statistics
  stats: {
    totalEarnings: { type: Number, default: 0 },
    monthlyEarnings: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    cancelledSessions: { type: Number, default: 0 },
    averageSessionRating: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
counsellorSchema.virtual('fullName').get(function() {
  if (this.user) {
    return `${this.user.firstName} ${this.user.lastName}`;
  }
  return '';
});

// Virtual for experience text
counsellorSchema.virtual('experienceText').get(function() {
  if (this.experience === 1) {
    return '1 year';
  }
  return `${this.experience} years`;
});

// Virtual for availability status
counsellorSchema.virtual('availabilityStatus').get(function() {
  if (!this.isActive) return 'Inactive';
  if (!this.isAvailable) return 'Unavailable';
  return 'Available';
});

// Unique index on the user ref — one User can only be one Counsellor
// Also speeds up Counsellor.findOne({ user: socket.userId }) on every socket connect
counsellorSchema.index({ user: 1 }, { unique: true });

// Indexes for search and filtering
// Primary discover query: isActive filter + rating sort
counsellorSchema.index({ isActive: 1, isAvailable: 1, rating: -1 });
// Price filter
counsellorSchema.index({ isActive: 1, hourlyRate: 1 });
// Language filter
counsellorSchema.index({ languages: 1, isActive: 1 });
// Specialization filters (both fields)
counsellorSchema.index({ specialization: 1, isActive: 1 });
counsellorSchema.index({ specializations: 1, isActive: 1 });
// Full-text search on specialization fields (used by the search query)
counsellorSchema.index({ specialization: 'text', specializations: 'text' });

// The updateRating() method correctly maintains the running average.
// The pre-save hook that recalculated rating has been removed — it used
// a broken formula: (current_rating * 10 / reviewCount) which corrupts
// the stored value on every unrelated save (e.g. toggling isAvailable).

// Static method to find available counsellors
counsellorSchema.statics.findAvailable = function(criteria = {}) {
  const query = {
    isActive: true,
    isAvailable: true,
    isVerified: true,
    ...criteria
  };
  
  return this.find(query)
    .populate('user', 'firstName lastName email phone profileImage')
    .sort({ rating: -1, reviewCount: -1 });
};

// Method to update rating
counsellorSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.reviewCount) + newRating;
  this.reviewCount += 1;
  this.rating = totalRating / this.reviewCount;
  return this.save();
};

// Method to check availability for a specific time
counsellorSchema.methods.isAvailableAt = function(dateTime) {
  if (!this.isActive || !this.isAvailable) return false;
  
  const tz = this.timezone || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
  }).formatToParts(dateTime);
  const dayOfWeek = parts.find(p => p.type === 'weekday').value.toLowerCase();
  const hour   = parts.find(p => p.type === 'hour').value.padStart(2, '0');
  const minute = parts.find(p => p.type === 'minute').value.padStart(2, '0');
  const time = `${hour}:${minute}`;
  
  const daySchedule = this.availability[dayOfWeek];
  if (!daySchedule || !daySchedule.isAvailable) return false;
  
  return time >= daySchedule.start && time <= daySchedule.end;
};

module.exports = mongoose.model('Counsellor', counsellorSchema);
