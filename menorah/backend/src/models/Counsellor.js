const mongoose = require('mongoose');
const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  COUNSELLOR_CONSENT_SOURCES,
  LEGACY_PROFESSIONAL_VERIFICATION_STATES,
  PROFESSIONAL_VERIFICATION_STATES,
} = require('../config/counsellorVerification');

const hasUniqueObjectIds = (values) => (
  Array.isArray(values)
  && values.every((value) => value != null)
  && new Set(values.map((value) => value.toString())).size === values.length
);

const adminHistoryActorRequired = function adminHistoryActorRequired() {
  return this.actorType === 'admin';
};

const systemHistoryHasNoActor = function systemHistoryHasNoActor(value) {
  return this.actorType !== 'system' || value == null;
};

const hasReverificationInviteValue = function hasReverificationInviteValue() {
  return [
    this.reverificationInviteTokenHash,
    this.reverificationInviteIssuedBy,
    this.reverificationInviteIssuedAt,
    this.reverificationInviteExpiresAt,
    this.reverificationInviteConsentVersion,
  ].some((value) => value != null);
};

const professionalConsentSchema = new mongoose.Schema({
  accepted: { type: Boolean, default: false },
  version: { type: String, default: null, trim: true, maxlength: 128 },
  acceptedAt: { type: Date, default: null },
  source: {
    type: String,
    enum: COUNSELLOR_CONSENT_SOURCES,
    default: null,
  },
}, { _id: false });

const professionalCredentialReviewSchema = new mongoose.Schema({
  decision: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  policyVersion: { type: String, default: null, trim: true, maxlength: 128 },
  evidenceIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
    validate: {
      validator: hasUniqueObjectIds,
      message: 'Credential review evidence IDs must be unique',
    },
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: { type: Date, default: null },
}, { _id: false });

const professionalStatusHistorySchema = new mongoose.Schema({
  from: { type: String, default: null, maxlength: 64 },
  to: {
    type: String,
    enum: PROFESSIONAL_VERIFICATION_STATES,
    required: true,
  },
  at: { type: Date, required: true },
  actorType: {
    type: String,
    enum: ['applicant', 'admin', 'system'],
    required: true,
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    required: adminHistoryActorRequired,
    validate: {
      validator: systemHistoryHasNoActor,
      message: 'System status history entries cannot name a user actor',
    },
  },
  reason: { type: String, default: null, maxlength: 1000 },
}, { _id: false });

const legacyVerificationSnapshotSchema = new mongoose.Schema({
  status: { type: String, default: null },
  isVerified: { type: Boolean, default: null },
  isActive: { type: Boolean, default: null },
  isAvailable: { type: Boolean, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  blockedAt: { type: Date, default: null },
  blockedReason: { type: String, default: null },
}, { _id: false });

const professionalVerificationSchema = new mongoose.Schema({
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PendingApplication',
    default: null,
  },
  onboardingConsent: {
    type: professionalConsentSchema,
    default: () => ({}),
  },
  credentialReview: {
    type: professionalCredentialReviewSchema,
    default: () => ({}),
  },
  reviewStartedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewStartedAt: { type: Date, default: null },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approvedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  suspendedAt: { type: Date, default: null },
  suspensionReason: { type: String, default: null, trim: true, maxlength: 1000 },
  expiredAt: { type: Date, default: null },
  reverificationRequestedAt: { type: Date, default: null },
  reverificationInviteTokenHash: {
    type: String,
    default: null,
    select: false,
    lowercase: true,
    trim: true,
    match: /^[a-f0-9]{64}$/,
    required: hasReverificationInviteValue,
  },
  reverificationInviteIssuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    select: false,
    required: hasReverificationInviteValue,
  },
  reverificationInviteIssuedAt: {
    type: Date,
    default: null,
    select: false,
    required: hasReverificationInviteValue,
  },
  reverificationInviteExpiresAt: {
    type: Date,
    default: null,
    select: false,
    required: hasReverificationInviteValue,
    validate: {
      validator(value) {
        return value == null
          || this.reverificationInviteIssuedAt == null
          || value > this.reverificationInviteIssuedAt;
      },
      message: 'Re-verification invite expiry must be after issuance',
    },
  },
  reverificationInviteConsentVersion: {
    type: String,
    default: null,
    select: false,
    trim: true,
    maxlength: 128,
    required: hasReverificationInviteValue,
  },
  marketplaceAssignmentFence: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Marketplace assignment fence must be a safe integer',
    },
  },
  legacyReviewRequired: { type: Boolean, default: false },
  legacySnapshot: {
    type: legacyVerificationSnapshotSchema,
    default: undefined,
  },
  schemaVersion: { type: Number, default: 1, min: 1 },
  migrationVersion: { type: String, default: null },
  statusHistory: {
    type: [professionalStatusHistorySchema],
    default: [],
  },
}, { _id: false });

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
    enum: ['INR'],
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
  profileImageStorage: {
    type: mongoose.Schema.Types.Mixed,
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
  voiceIntroStorage: {
    type: mongoose.Schema.Types.Mixed,
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
    storage: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
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
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: false
  },
  verificationDocuments: [{
    type: {
      type: String,
      enum: ['license', 'certification', 'education', 'identity']
    },
    url: String,
    storage: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  professionalVerification: {
    type: professionalVerificationSchema,
    default: () => ({}),
  },

  // Admin-controlled status
  status: {
    type: String,
    enum: [
      ...PROFESSIONAL_VERIFICATION_STATES,
      ...LEGACY_PROFESSIONAL_VERIFICATION_STATES,
    ],
    default: 'draft',
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
// Keep the applicant-issued license string unchanged while making case-only
// variants one identity. The legacy binary `licenseNumber_1` index generated
// by `unique: true` remains intentionally compatible and harmless.
counsellorSchema.index(
  { licenseNumber: 1 },
  {
    name: 'counsellor_license_identity_unique_v1',
    unique: true,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  }
);

// Indexes for search and filtering
// Primary discover query: isActive filter + rating sort
counsellorSchema.index({ isActive: 1, isAvailable: 1, rating: -1 });
// Migration-owned bounded expiry sweep. Normal service startup keeps
// autoIndex disabled; the explicit name documents parity with the migration.
counsellorSchema.index(
  { status: 1, 'professionalVerification.expiresAt': 1, _id: 1 },
  { name: 'professional_verification_expiry_sweep_v1' }
);
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
