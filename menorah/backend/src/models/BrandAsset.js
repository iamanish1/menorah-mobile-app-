const mongoose = require('mongoose');

const brandAssetSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'logo',
      'font',
      'image',
      'icon',
      'template',
      'background',
      'product_image',
      'reference_post',
      'brand_guideline'
    ],
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  publicId: {
    type: String,
    default: ''
  },
  mimeType: {
    type: String,
    default: ''
  },
  sizeBytes: {
    type: Number,
    default: 0
  },
  storage: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  colors: [{
    type: String,
    trim: true
  }],
  width: {
    type: Number,
    default: null
  },
  height: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

brandAssetSchema.index({ status: 1, type: 1, tags: 1 });

module.exports = mongoose.model('BrandAsset', brandAssetSchema);
