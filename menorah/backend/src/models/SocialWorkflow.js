const mongoose = require('mongoose');

const campaignBriefSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
    trim: true,
    maxlength: 240
  },
  campaignName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  audience: {
    type: String,
    required: true,
    trim: true,
    maxlength: 240
  },
  objective: {
    type: String,
    required: true,
    trim: true,
    maxlength: 240
  },
  tone: {
    type: String,
    default: 'Warm, grounded, premium, and practical',
    trim: true,
    maxlength: 180
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
    default: 1,
    min: 1,
    max: 50
  },
  textSystemPromptOverride: {
    type: String,
    default: '',
    maxlength: 8000
  },
  imageSystemPromptOverride: {
    type: String,
    default: '',
    maxlength: 8000
  }
});

const scheduleSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['none', 'once', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  timezone: {
    type: String,
    default: 'Asia/Dubai',
    trim: true
  },
  runAt: {
    type: Date,
    default: null
  },
  timeOfDay: {
    type: String,
    default: '09:00',
    trim: true
  },
  dayOfWeek: {
    type: Number,
    default: 1,
    min: 0,
    max: 6
  },
  dayOfMonth: {
    type: Number,
    default: 1,
    min: 1,
    max: 31
  },
  lastScheduledKey: {
    type: String,
    default: ''
  }
}, { _id: false });

const socialWorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
    index: true
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 600
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'archived'],
    default: 'active',
    index: true
  },
  customMaxPosts: {
    type: Number,
    default: 20,
    min: 1,
    max: 100
  },
  campaigns: {
    type: [campaignBriefSchema],
    default: []
  },
  schedule: {
    type: scheduleSchema,
    default: () => ({})
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
  timestamps: true
});

socialWorkflowSchema.index({ status: 1, 'schedule.enabled': 1 });

module.exports = mongoose.model('SocialWorkflow', socialWorkflowSchema);

