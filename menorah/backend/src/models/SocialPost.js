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
    enum: ['single_image', 'carousel', 'reel_cover', 'reel'],
    default: 'single_image'
  },
  contentSource: {
    type: String,
    enum: ['ai', 'manual'],
    default: 'ai',
    index: true
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
  finalImageStorage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  thumbnailStorage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  sourceImageStorage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Reel media is deliberately separate from image fields. A reel must have a
  // public HTTPS video URL before it can pass review or reach Instagram.
  videoUrl: {
    type: String,
    default: ''
  },
  videoPublicId: {
    type: String,
    default: ''
  },
  // Optional for backward compatibility with Reels created before managed
  // media metadata was recorded. New uploads persist the immutable storage
  // record so backup/restore verification can link the database reference to
  // the exact video bytes.
  videoStorage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  videoMimeType: {
    type: String,
    default: ''
  },
  videoSizeBytes: {
    type: Number,
    default: 0
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
  // Retaining the creation container lets a retry resume publishing instead
  // of creating a second Instagram post after a network timeout.
  instagramContainerId: {
    type: String,
    default: ''
  },
  instagramPermalink: {
    type: String,
    default: ''
  },
  publishingStartedAt: {
    type: Date,
    default: null
  },
  publishAttemptCount: {
    type: Number,
    default: 0
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
