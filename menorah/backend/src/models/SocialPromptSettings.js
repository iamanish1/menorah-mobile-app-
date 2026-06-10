const mongoose = require('mongoose');

const socialPromptSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'default',
    unique: true,
    index: true
  },
  textSystemPrompt: {
    type: String,
    default: '',
    maxlength: 8000
  },
  imageSystemPrompt: {
    type: String,
    default: '',
    maxlength: 8000
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SocialPromptSettings', socialPromptSettingsSchema);

