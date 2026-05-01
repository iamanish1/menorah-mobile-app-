const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Chat room reference
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true
  },

  // Sender information
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Message content
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [5000, 'Message content cannot exceed 5000 characters']
  },

  // Message type
  type: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },

  // File attachment (if type is image or file)
  attachment: {
    url: String,
    fileName: String,
    fileSize: Number,
    mimeType: String
  },

  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },

  // Read receipts
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Message flags
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Reply to message (for threaded conversations)
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ isDeleted: 1 });

// Pre-save middleware to update room's last message
messageSchema.pre('save', async function(next) {
  if (this.isNew && !this.isDeleted) {
    const ChatRoom = mongoose.model('ChatRoom');
    await ChatRoom.findByIdAndUpdate(this.room, {
      $set: {
        'lastMessage.content': this.content,
        'lastMessage.senderId': this.sender,
        'lastMessage.timestamp': new Date(),
        updatedAt: new Date()
      }
    });
  }
  next();
});

// Method to mark as read
messageSchema.methods.markAsRead = function(userId) {
  // Check if already read by this user
  const alreadyRead = this.readBy.some(
    read => read.userId.toString() === userId.toString()
  );

  if (!alreadyRead) {
    this.readBy.push({
      userId: userId,
      readAt: new Date()
    });
    this.status = 'read';
    return this.save();
  }

  return Promise.resolve(this);
};

// Method to soft delete message
messageSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

module.exports = mongoose.model('Message', messageSchema);

