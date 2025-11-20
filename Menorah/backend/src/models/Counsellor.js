const mongoose = require('mongoose');

const counsellorSchema = new mongoose.Schema({
  // Basic information
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

  // Payment and commission
  commissionRate: {
    type: Number,
    default: 20, // percentage
    min: 0,
    max: 100
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },

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

// Indexes for search and filtering
counsellorSchema.index({ specialization: 1, isActive: 1, isAvailable: 1 });
counsellorSchema.index({ languages: 1 });
counsellorSchema.index({ specializations: 1 });
counsellorSchema.index({ rating: -1 });
counsellorSchema.index({ hourlyRate: 1 });
counsellorSchema.index({ location: '2dsphere' });

// Pre-save middleware to update rating
counsellorSchema.pre('save', function(next) {
  if (this.reviewCount > 0) {
    this.rating = Math.round((this.rating * 10) / this.reviewCount) / 10;
  }
  next();
});

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
  
  const dayOfWeek = dateTime.toLocaleLowerCase();
  const time = dateTime.toTimeString().slice(0, 5); // HH:MM format
  
  const daySchedule = this.availability[dayOfWeek];
  if (!daySchedule || !daySchedule.isAvailable) return false;
  
  return time >= daySchedule.start && time <= daySchedule.end;
};

module.exports = mongoose.model('Counsellor', counsellorSchema);
