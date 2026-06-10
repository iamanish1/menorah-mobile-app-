const mongoose = require('mongoose');

const runErrorSchema = new mongoose.Schema({
  campaignName: {
    type: String,
    default: ''
  },
  stage: {
    type: String,
    default: 'generation'
  },
  message: {
    type: String,
    required: true
  },
  at: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const campaignSnapshotSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    default: ''
  },
  topic: {
    type: String,
    required: true
  },
  campaignName: {
    type: String,
    required: true
  },
  audience: {
    type: String,
    required: true
  },
  objective: {
    type: String,
    required: true
  },
  tone: {
    type: String,
    default: ''
  },
  postType: {
    type: String,
    enum: ['single_image'],
    default: 'single_image'
  },
  aspectRatio: {
    type: String,
    enum: ['1:1', '4:5', '9:16'],
    default: '4:5'
  },
  postCount: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  textSystemPromptOverride: {
    type: String,
    default: ''
  },
  imageSystemPromptOverride: {
    type: String,
    default: ''
  }
}, { _id: false });

const socialGenerationRunSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['manual', 'scheduled'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'partial', 'failed'],
    default: 'queued',
    index: true
  },
  requestedCount: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  completedCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  workflow: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialWorkflow',
    default: null,
    index: true
  },
  workflowName: {
    type: String,
    default: ''
  },
  campaigns: {
    type: [campaignSnapshotSchema],
    default: []
  },
  textSystemPrompt: {
    type: String,
    default: ''
  },
  imageSystemPrompt: {
    type: String,
    default: ''
  },
  timezone: {
    type: String,
    default: 'Asia/Dubai'
  },
  scheduleKey: {
    type: String,
    default: null
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  postIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialPost'
  }],
  errors: {
    type: [runErrorSchema],
    default: []
  },
  startedAt: {
    type: Date,
    default: null
  },
  finishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  suppressReservedKeysWarning: true
});

socialGenerationRunSchema.index(
  { scheduleKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      scheduleKey: { $type: 'string' }
    }
  }
);

module.exports = mongoose.model('SocialGenerationRun', socialGenerationRunSchema);
