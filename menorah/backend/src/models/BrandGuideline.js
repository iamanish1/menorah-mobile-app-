const mongoose = require('mongoose');

const brandGuidelineSchema = new mongoose.Schema({
  brandName: {
    type: String,
    default: 'Menorah Health',
    trim: true
  },
  tone: {
    type: String,
    default: 'Warm, grounded, professional, and practical.',
    trim: true
  },
  audience: {
    type: String,
    default: 'Men seeking approachable mental health support and education.',
    trim: true
  },
  primaryColors: [{
    type: String,
    trim: true
  }],
  secondaryColors: [{
    type: String,
    trim: true
  }],
  fonts: [{
    type: String,
    trim: true
  }],
  logoRules: {
    allowedPositions: [{
      type: String,
      enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'center']
    }],
    minWidth: {
      type: Number,
      default: 120
    },
    clearSpace: {
      type: Number,
      default: 48
    }
  },
  postRules: {
    maxWordsOnImage: {
      type: Number,
      default: 24
    },
    allowedAspectRatios: [{
      type: String,
      enum: ['1:1', '4:5', '9:16']
    }],
    defaultAspectRatio: {
      type: String,
      enum: ['1:1', '4:5', '9:16'],
      default: '4:5'
    },
    forbiddenWords: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    ctaStyle: {
      type: String,
      default: 'Soft, direct, and non-salesy.'
    }
  },
  instagramRules: {
    defaultHashtags: [{
      type: String,
      trim: true
    }],
    bannedHashtags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    captionMaxLength: {
      type: Number,
      default: 2200
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

brandGuidelineSchema.pre('validate', function setDefaults(next) {
  if (!this.primaryColors || this.primaryColors.length === 0) {
    this.primaryColors = ['#27533A', '#2F8A63'];
  }
  if (!this.secondaryColors || this.secondaryColors.length === 0) {
    this.secondaryColors = ['#F7F0DF', '#FFFFFF', '#1F2933'];
  }
  if (!this.fonts || this.fonts.length === 0) {
    this.fonts = ['Inter', 'Arial', 'sans-serif'];
  }
  if (!this.logoRules?.allowedPositions || this.logoRules.allowedPositions.length === 0) {
    this.logoRules.allowedPositions = ['top_left', 'bottom_right'];
  }
  if (!this.postRules?.allowedAspectRatios || this.postRules.allowedAspectRatios.length === 0) {
    this.postRules.allowedAspectRatios = ['1:1', '4:5', '9:16'];
  }
  if (!this.instagramRules?.defaultHashtags || this.instagramRules.defaultHashtags.length === 0) {
    this.instagramRules.defaultHashtags = [
      'MenorahHealth',
      'MensMentalHealth',
      'MentalHealthSupport',
      'SelfCare',
      'EmotionalWellbeing'
    ];
  }
  next();
});

module.exports = mongoose.model('BrandGuideline', brandGuidelineSchema);
