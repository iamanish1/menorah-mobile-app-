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
  }
  // createdAt and updatedAt are managed by { timestamps: true } below.
  // Manual definitions were removed — they conflicted with Mongoose's timestamps
  // option, causing updatedAt to be stale on save().
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
// Unique constraint prevents race-condition duplicate rooms
chatRoomSchema.index({ user: 1, counsellor: 1 }, { unique: true }); // findOrCreate lookup
chatRoomSchema.index({ user: 1, isActive: 1, updatedAt: -1 });       // user room list
chatRoomSchema.index({ counsellor: 1, isActive: 1, updatedAt: -1 }); // counsellor room list
chatRoomSchema.index({ booking: 1 });
chatRoomSchema.index({ updatedAt: -1 });

// Static method to find or create a chat room
chatRoomSchema.statics.findOrCreate = async function(userId, counsellorId) {
  let room = await this.findOne({
    user: userId,
    counsellor: counsellorId
  })
    .populate('counsellor', 'user')
    .populate('counsellor.user', 'firstName lastName profileImage')
    .populate('user', 'firstName lastName profileImage')
    .populate('lastMessage.senderId', 'firstName lastName');

  if (!room) {
    try {
      room = await this.create({
        user: userId,
        counsellor: counsellorId,
        booking: null,
        isActive: true
      });
    } catch (error) {
      // Two devices may resolve the same conversation at once. The unique
      // participant-pair index makes that safe; load the winner of the race.
      if (error?.code !== 11000) throw error;
    }

    room = await this.findOne({ user: userId, counsellor: counsellorId })
      .populate('counsellor', 'user')
      .populate('counsellor.user', 'firstName lastName profileImage')
      .populate('user', 'firstName lastName profileImage');
  }

  return room;
};

// Method to update last message
chatRoomSchema.methods.updateLastMessage = function(messageContent, senderId) {
  this.lastMessage = { content: messageContent, senderId, timestamp: new Date() };
  // updatedAt is handled automatically by { timestamps: true }
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
