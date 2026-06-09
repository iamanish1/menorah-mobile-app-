const mongoose = require('mongoose');

const generationJobSchema = new mongoose.Schema({
  socialPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialPost',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: [
      'queued',
      'generating_concept',
      'generating_caption',
      'generating_image',
      'rendering',
      'quality_checking',
      'completed',
      'failed'
    ],
    default: 'queued',
    index: true
  },
  step: {
    type: String,
    default: ''
  },
  progress: {
    type: Number,
    default: 0
  },
  provider: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  },
  logs: [{
    step: String,
    message: String,
    at: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('GenerationJob', generationJobSchema);
