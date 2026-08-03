const mongoose = require('mongoose');
const {
  GAD7_TYPE,
  GAD7_VERSION,
} = require('../services/gad7Assessment');

const SEVERITY_CATEGORIES = Object.freeze(['Minimal', 'Mild', 'Moderate', 'Severe']);

const psychometricAssessmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  assessmentType: {
    type: String,
    enum: [GAD7_TYPE],
    required: true,
    immutable: true,
  },
  assessmentVersion: {
    type: String,
    enum: [GAD7_VERSION],
    required: true,
    immutable: true,
  },
  language: {
    type: String,
    enum: ['en'],
    required: true,
    immutable: true,
  },
  answersEncrypted: {
    type: String,
    required: true,
    immutable: true,
    select: false,
  },
  answerCount: {
    type: Number,
    enum: [7],
    required: true,
    immutable: true,
  },
  totalScore: {
    type: Number,
    min: 0,
    max: 21,
    required: true,
    immutable: true,
  },
  severityCategory: {
    type: String,
    enum: SEVERITY_CATEGORIES,
    required: true,
    immutable: true,
  },
  completedAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
  idempotencyKeyHash: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    immutable: true,
    select: false,
  },
  requestFingerprint: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    immutable: true,
    select: false,
  },
}, {
  timestamps: true,
  versionKey: false,
});

psychometricAssessmentSchema.index(
  { user: 1, idempotencyKeyHash: 1 },
  {
    unique: true,
    name: 'assessment_user_idempotency_unique_v1',
  }
);
psychometricAssessmentSchema.index(
  { user: 1, completedAt: -1 },
  { name: 'assessment_user_completedAt_v1' }
);
psychometricAssessmentSchema.index(
  { user: 1, assessmentType: 1, completedAt: -1 },
  { name: 'assessment_user_type_completedAt_v1' }
);

module.exports = mongoose.model('PsychometricAssessment', psychometricAssessmentSchema);
module.exports.SEVERITY_CATEGORIES = SEVERITY_CATEGORIES;
