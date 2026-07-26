const mongoose = require('mongoose');

const privacyConsentStateSchema = new mongoose.Schema({
  subjectUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  currentEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrivacyEvent',
    default: null,
  },
  action: {
    type: String,
    enum: ['accepted', 'withdrawn', null],
    default: null,
  },
  noticeVersion: {
    type: String,
    default: null,
    maxlength: 128,
  },
  version: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
  versionKey: false,
});

privacyConsentStateSchema.index(
  { subjectUser: 1 },
  { unique: true, name: 'privacy_consent_state_subject_unique_v2' }
);

module.exports = mongoose.model('PrivacyConsentState', privacyConsentStateSchema);
