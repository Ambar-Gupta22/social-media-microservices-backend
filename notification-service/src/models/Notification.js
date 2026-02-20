const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true, // POST_LIKED, POST_COMMENTED
    },

    message: {
      type: String,
      required: true,
    },

    metadata: {
      postId: mongoose.Schema.Types.ObjectId,
      commentId: mongoose.Schema.Types.ObjectId,
      conversationId: mongoose.Schema.Types.ObjectId,
      messageId: mongoose.Schema.Types.ObjectId,
      senderId: mongoose.Schema.Types.ObjectId,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

/**
 * Idempotency index
 * Prevents duplicate notifications on re-delivery
 */
notificationSchema.index(
  {
    userId: 1,
    type: 1,
    "metadata.postId": 1,
    "metadata.commentId": 1,
    "metadata.senderId": 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
