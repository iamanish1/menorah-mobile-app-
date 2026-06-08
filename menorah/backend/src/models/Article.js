const mongoose = require('mongoose');

const contentBlockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['heading', 'paragraph', 'quote', 'bullet_list', 'image', 'callout'],
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  level: {
    type: Number,
    min: 1,
    max: 6,
    default: null
  },
  items: [{
    type: String,
    trim: true
  }],
  url: {
    type: String,
    default: null
  },
  alt: {
    type: String,
    default: ''
  },
  caption: {
    type: String,
    default: ''
  }
}, { _id: false });

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Article title is required'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Article slug is required'],
    unique: true,
    index: true,
    trim: true,
    lowercase: true
  },
  excerpt: {
    type: String,
    required: [true, 'Article excerpt is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Article category is required'],
    trim: true,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  coverImageUrl: {
    type: String,
    default: null
  },
  coverImagePublicId: {
    type: String,
    default: null
  },
  imagePrompt: {
    type: String,
    default: ''
  },
  contentBlocks: {
    type: [contentBlockSchema],
    default: []
  },
  seoTitle: {
    type: String,
    default: ''
  },
  seoDescription: {
    type: String,
    default: ''
  },
  canonicalUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'review', 'published', 'archived', 'rejected'],
    default: 'draft',
    index: true
  },
  generationRun: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArticleGenerationRun',
    default: null,
    index: true
  },
  wordCount: {
    type: Number,
    default: 0
  },
  generatedByAi: {
    type: Boolean,
    default: false
  },
  reviewedByHuman: {
    type: Boolean,
    default: false
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

articleSchema.index({
  title: 'text',
  excerpt: 'text',
  category: 'text',
  tags: 'text'
});
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ category: 1, status: 1 });
articleSchema.index({ generationRun: 1, status: 1 });

module.exports = mongoose.model('Article', articleSchema);
