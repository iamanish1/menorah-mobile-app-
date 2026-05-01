const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  // Participants
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  counsellor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Counsellor',
    required: true
  },

  // Associated booking (optional - for session-based chats)
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },

  // Last message info for quick access
  lastMessage: {
    content: String,
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date
  },

  // Unread counts for each participant
  unreadCount: {
    user: {
      type: Number,
      default: 0
    },
    counsellor: {
      type: Number,
      default: 0
    }
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
chatRoomSchema.index({ user: 1, counsellor: 1 });
chatRoomSchema.index({ booking: 1 });
chatRoomSchema.index({ updatedAt: -1 });

// Static method to find or create a chat room
chatRoomSchema.statics.findOrCreate = async function(userId, counsellorId, bookingId = null) {
  let room = await this.findOne({
    user: userId,
    counsellor: counsellorId,
    ...(bookingId && { booking: bookingId })
  })
    .populate('counsellor', 'user')
    .populate('counsellor.user', 'firstName lastName profileImage')
    .populate('user', 'firstName lastName profileImage')
    .populate('lastMessage.senderId', 'firstName lastName');

  if (!room) {
    room = await this.create({
      user: userId,
      counsellor: counsellorId,
      booking: bookingId,
      isActive: true
    });

    room = await this.findById(room._id)
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('user', 'firstName lastName profileImage');
  }

  return room;
};

// Method to update last message
chatRoomSchema.methods.updateLastMessage = function(messageContent, senderId) {
  this.lastMessage = {
    content: messageContent,
    senderId: senderId,
    timestamp: new Date()
  };
  this.updatedAt = new Date();
  return this.save();
};

// Method to increment unread count
chatRoomSchema.methods.incrementUnread = function(forUser) {
  if (forUser === 'user') {
    this.unreadCount.user += 1;
  } else {
    this.unreadCount.counsellor += 1;
  }
  return this.save();
};

// Method to reset unread count
chatRoomSchema.methods.resetUnread = function(forUser) {
  if (forUser === 'user') {
    this.unreadCount.user = 0;
  } else {
    this.unreadCount.counsellor = 0;
  }
  return this.save();
};

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

