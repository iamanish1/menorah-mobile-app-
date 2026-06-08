const mongoose = require('mongoose');

const runErrorSchema = new mongoose.Schema({
  topic: {
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

const articleGenerationRunSchema = new mongoose.Schema({
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
    max: 50
  },
  completedCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  timezone: {
    type: String,
    default: 'Asia/Dubai'
  },
  dateKey: {
    type: String,
    default: null,
    index: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  articleIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
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
  timestamps: true
});

articleGenerationRunSchema.index(
  { source: 1, dateKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: 'scheduled',
      dateKey: { $type: 'string' }
    }
  }
);

module.exports = mongoose.model('ArticleGenerationRun', articleGenerationRunSchema);
