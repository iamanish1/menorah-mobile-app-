const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema({
  message: {
    type: String,
    default: ''
  },
  code: {
    type: String,
    default: ''
  },
  at: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const socialPostSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['instagram'],
    default: 'instagram',
    index: true
  },
  postType: {
    type: String,
    enum: ['single_image', 'carousel', 'reel_cover'],
    default: 'single_image'
  },
  status: {
    type: String,
    enum: [
      'draft',
      'needs_review',
      'approved',
      'scheduled',
      'publishing',
      'published',
      'rejected',
      'failed_generation',
      'failed_publish',
      'expired_token'
    ],
    default: 'draft',
    index: true
  },
  topic: {
    type: String,
    required: true,
    trim: true
  },
  campaignName: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  audience: {
    type: String,
    default: '',
    trim: true
  },
  objective: {
    type: String,
    default: '',
    trim: true
  },
  tone: {
    type: String,
    default: '',
    trim: true
  },
  hookText: {
    type: String,
    default: ''
  },
  bodyText: {
    type: String,
    default: ''
  },
  ctaText: {
    type: String,
    default: ''
  },
  caption: {
    type: String,
    default: ''
  },
  hashtags: [{
    type: String,
    trim: true
  }],
  aiPrompt: {
    type: String,
    default: ''
  },
  designBrief: {
    type: String,
    default: ''
  },
  templateKey: {
    type: String,
    enum: ['thought_leadership', 'educational_tip', 'announcement'],
    default: 'thought_leadership'
  },
  selectedAssetIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BrandAsset'
  }],
  imageUrl: {
    type: String,
    default: ''
  },
  finalImageUrl: {
    type: String,
    default: ''
  },
  finalImagePublicId: {
    type: String,
    default: ''
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  aspectRatio: {
    type: String,
    enum: ['1:1', '4:5', '9:16'],
    default: '4:5'
  },
  width: {
    type: Number,
    default: 1080
  },
  height: {
    type: Number,
    default: 1350
  },
  modelUsed: {
    type: String,
    default: ''
  },
  promptVersion: {
    type: String,
    default: 'social-studio-v1'
  },
  qualityScore: {
    type: Number,
    default: 0
  },
  qualityIssues: [{
    type: String,
    trim: true
  }],
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  scheduledAt: {
    type: Date,
    default: null,
    index: true
  },
  publishedAt: {
    type: Date,
    default: null
  },
  instagramAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InstagramAccount',
    default: null
  },
  instagramMediaId: {
    type: String,
    default: ''
  },
  instagramPermalink: {
    type: String,
    default: ''
  },
  errorLog: {
    type: errorLogSchema,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

socialPostSchema.index({ status: 1, createdAt: -1 });
socialPostSchema.index({ campaignName: 1, status: 1 });
socialPostSchema.index({ topic: 'text', caption: 'text', campaignName: 'text' });

module.exports = mongoose.model('SocialPost', socialPostSchema);
