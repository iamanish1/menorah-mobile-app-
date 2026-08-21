const mongoose = require('mongoose');

const pendingApplicationSchema = new mongoose.Schema({
  firstName:      { type: String, trim: true },
  lastName:       { type: String, trim: true },
  email:          { type: String, lowercase: true, trim: true, index: true },
  phone:          { type: String, trim: true },
  dateOfBirth:    { type: Date },
  gender:         { type: String },
  licenseNumber:  { type: String, trim: true },
  specialization: { type: String, trim: true },
  specializations:{ type: [String], default: [] },
  experience:     { type: Number },
  bio:            { type: String },
  languages:      { type: [String], default: [] },
  hourlyRate:     { type: Number },
  currency:       { type: String, default: 'INR' },
  education:      { type: mongoose.Schema.Types.Mixed, default: [] },
  certifications: { type: mongoose.Schema.Types.Mixed, default: [] },
  availability:   { type: mongoose.Schema.Types.Mixed },
  statusLookupTokenHash: { type: String, select: false, index: true, unique: true, sparse: true },
  status:         { type: String, enum: ['pending', 'manual_review', 'rejected'], default: 'pending', index: true },
  identityConflict: {
    hasConflict: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    phone: { type: Boolean, default: false },
    detectedAt: { type: Date, default: null },
  },
  rejectionReason:{ type: String, default: null },
  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:     { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PendingApplication', pendingApplicationSchema);
