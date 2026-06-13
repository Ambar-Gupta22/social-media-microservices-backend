const Notification = require("../models/Notification");
const { logger } = require("@social-media/shared");

/**
 * Handle POST_LIKED event
 */
async function handlePostLiked(event) {
  try {
    const { receiverId, actorId, postId, type } = event;

    if (!receiverId || !actorId || !postId) {
      logger.warn("Invalid POST_LIKED event payload", { event });
      return;
    }

    await Notification.create({
      userId: receiverId,
      type: type || "POST_LIKED",
      message: "Someone liked your post",
      metadata: {
        postId,
        senderId: actorId,
      },
      isRead: false,
    });

    logger.info("POST_LIKED notification created", {
      receiverId,
      postId,
      actorId,
    });

  } catch (err) {
    // Handle duplicate key error (idempotency protection)
    if (err.code === 11000) {
      logger.info("Duplicate POST_LIKED notification skipped", {
        event,
      });
      return;
    }

    logger.error("Failed to handle POST_LIKED event", {
      error: err.message,
      stack: err.stack,
      event,
    });

    throw err;
  }
}

/**
 * Handle POST_COMMENTED event
 */
async function handlePostCommented(event) {
  try {
    const { receiverId, actorId, postId, commentId, type } = event;

    if (!receiverId || !actorId || !postId || !commentId) {
      logger.warn("Invalid POST_COMMENTED event payload", { event });
      return;
    }

    await Notification.create({
      userId: receiverId,
      type: type || "POST_COMMENTED",
      message: "Someone commented on your post",
      metadata: {
        postId,
        commentId,
        senderId: actorId,
      },
      isRead: false,
    });

    logger.info("POST_COMMENTED notification created", {
      receiverId,
      postId,
      commentId,
      actorId,
    });

  } catch (err) {
    if (err.code === 11000) {
      logger.info("Duplicate POST_COMMENTED notification skipped", {
        event,
      });
      return;
    }

    logger.error("Failed to handle POST_COMMENTED event", {
      error: err.message,
      stack: err.stack,
      event,
    });

    throw err;
  }
}

/**
 * Handle MESSAGE_RECEIVED event (Chat notifications)
 */
async function handleMessageReceived(event) {
  try {
    const { receiverId, actorId, conversationId, messageId, type } = event;

    if (!receiverId || !actorId || !conversationId || !messageId) {
      logger.warn("Invalid MESSAGE_RECEIVED event payload", { event });
      return;
    }

    await Notification.create({
      userId: receiverId,
      type: type || "MESSAGE_RECEIVED",
      message: "You received a new message",
      metadata: {
        senderId: actorId,
        conversationId,
        messageId,
      },
      isRead: false,
    });

    logger.info("MESSAGE_RECEIVED notification created", {
      receiverId,
      actorId,
      conversationId,
      messageId,
    });

  } catch (err) {
    if (err.code === 11000) {
      logger.info("Duplicate MESSAGE_RECEIVED notification skipped", {
        event,
      });
      return;
    }

    logger.error("Failed to handle MESSAGE_RECEIVED event", {
      error: err.message,
      stack: err.stack,
      event,
    });

    throw err;
  }
}

module.exports = {
  handlePostLiked,
  handlePostCommented,
  handleMessageReceived,
};