const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { recordRoleChange } = require('../utils/securityAudit');

const userSchema = new mongoose.Schema({
  // Authentication fields
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  passwordAuthEnabled: {
    type: Boolean,
    default: true,
    select: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: { type: String, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },

  // Profile information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say'],
    required: [true, 'Gender is required']
  },
  profileImage: {
    type: String,
    default: null
  },
  profileImageStorage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },

  // Preferences
  preferredLanguage: {
    type: String,
    default: 'English'
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    push: { type: Boolean, default: true }
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null,
    select: false
  },
  sessionVersion: {
    type: Number,
    default: 0
  },
  marketplaceAssignmentFence: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: 'Marketplace assignment fence must be a safe integer'
    }
  },
  lastSessionRevokedAt: {
    type: Date,
    default: null,
    select: false
  },
  lastPasswordChangeAt: {
    type: Date,
    default: null,
    select: false
  },

  // Subscription and billing
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium'],
      default: 'free'
    },
    subscriptionType: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: null
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: false
    }
  },

  // Optional face-check status. Biometric images are not stored here.
  kyc: {
    status: {
      type: String,
      enum: ['not_started', 'pending', 'verified', 'manual_review', 'rejected'],
      default: 'not_started'
    },
    provider: {
      type: String,
      default: null
    },
    submittedAt: Date,
    verifiedAt: Date,
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewReason: String,
    faceCheckConfidence: Number
  },

  socialAuth: {
    googleSub: {
      type: String,
      default: undefined
    },
    appleSub: {
      type: String,
      default: undefined
    },
    appleEmailPrivateRelay: {
      type: Boolean,
      default: false
    },
    appleRefreshTokenEncrypted: {
      type: String,
      default: undefined,
      select: false,
    },
    appleClientId: {
      type: String,
      default: undefined,
      select: false,
    }
  },

  // Role
  role: {
    type: String,
    enum: ['user', 'counsellor', 'admin'],
    default: 'user'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Index for search
userSchema.index({ email: 1, phone: 1 });
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'kyc.status': 1 });

const uniqueStringIndex = (field) => ({
  unique: true,
  partialFilterExpression: { [field]: { $type: 'string' } },
});

// Sparse indexes on token fields — speeds up password-reset and email-verify lookups
userSchema.index({ passwordResetToken:     1 }, { sparse: true });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ 'socialAuth.googleSub': 1 }, uniqueStringIndex('socialAuth.googleSub'));
userSchema.index({ 'socialAuth.appleSub': 1 }, uniqueStringIndex('socialAuth.appleSub'));

userSchema.pre('save', async function capturePrivilegedRoleChange() {
  if (!this.isModified('role')) return;

  let previousRole = 'none';
  if (!this.isNew) {
    const query = this.constructor.findById(this._id).select('role').lean();
    const session = this.$session();
    if (session) query.session(session);
    const previous = await query;
    previousRole = previous?.role || 'none';
  }
  this.$locals.privilegedRoleChange = {
    previousRole,
    nextRole: this.role || 'none',
  };
});

userSchema.post('save', function auditPrivilegedRoleChange(document) {
  const change = this.$locals.privilegedRoleChange;
  delete this.$locals.privilegedRoleChange;
  if (!change) return;
  recordRoleChange({
    target: document._id,
    previousRole: change.previousRole,
    nextRole: change.nextRole,
  });
});

userSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'],
  function rejectUnauditedRoleMutation(next) {
    const update = this.getUpdate() || {};
    const mutatesRole = Object.prototype.hasOwnProperty.call(update, 'role')
      || Object.prototype.hasOwnProperty.call(update.$set || {}, 'role')
      || Object.prototype.hasOwnProperty.call(update.$unset || {}, 'role');
    if (mutatesRole) {
      return next(new Error(
        'Role changes must use a loaded User document and save() so signed audit instrumentation cannot be bypassed.'
      ));
    }
    return next();
  }
);

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  // Skip re-hashing if the password was already hashed externally (e.g. from Redis pending-reg flow)
  if (this.password.startsWith('$2b$') || this.password.startsWith('$2a$')) return next();
  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!candidatePassword || !this.password) return false;
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error.message);
    return false;
  }
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

module.exports = mongoose.model('User', userSchema);
