const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const { publishEvent } = require("../utils/rabbitmq");
const { validateSendMessage } = require("../utils/validation");
const logger = require("../utils/logger");
const { io, onlineUsers } = require("../server");

/**
 * Create or get existing conversation
 */
const createOrGetConversation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otherUserId } = req.body;

    logger.info("Create/Get conversation request received", {
      userId,
      otherUserId,
    });

    if (!otherUserId) {
      logger.warn("Conversation creation failed - missing otherUserId", {
        userId,
      });

      return res.status(400).json({
        success: false,
        message: "otherUserId is required",
      });
    }

    // Prevent self-chat
    if (userId === otherUserId) {
      logger.warn("User attempted to create conversation with self", {
        userId,
      });

      return res.status(400).json({
        success: false,
        message: "Cannot create conversation with yourself",
      });
    }

    // Sort participants to avoid [A,B] vs [B,A]
    const participants = [userId, otherUserId].sort();

    let conversation = await Conversation.findOne({ participants });

    if (conversation) {
      logger.info("Existing conversation found", {
        conversationId: conversation._id,
        participants,
      });
    } else {
      conversation = await Conversation.create({ participants });

      logger.info("New conversation created", {
        conversationId: conversation._id,
        participants,
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (err) {
    logger.error("Failed to create or get conversation", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to create conversation",
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { error } = validateSendMessage(req.body);
    if (error) {
      logger.warn("Invalid send message payload", {
        userId: req.user.userId,
        message: error.details[0].message,
      });

      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const senderId = req.user.userId;
    const { conversationId, content } = req.body;

    // Ensure conversation exists
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      logger.warn("Conversation not found", {
        conversationId,
        senderId,
      });

      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Ensure sender is part of conversation
    if (!conversation.participants.some(id => id.toString() === senderId)) {
      logger.warn("Unauthorized message attempt", {
        senderId,
        conversationId,
      });

      return res.status(403).json({
        success: false,
        message: "You are not part of this conversation",
      });
    }

    // Determine receiver (1–1 chat)
    const receiverId = conversation.participants.find(
      (id) => id.toString() !== senderId
    );

    // Save message
    const message = await Message.create({
      conversationId,
      senderId,
      receiverId,
      content,
    });

    logger.info("Message saved", {
      messageId: message._id,
      conversationId,
      senderId,
      receiverId,
    });

    // Emit event for notifications (non-blocking)
    publishEvent("message.sent", {
      type: "MESSAGE_RECEIVED",
      receiverId,
      actorId: senderId,
      conversationId,
      messageId: message._id.toString(),
    }).catch(err =>
      logger.error("Failed to publish message.sent event", err)
    );

    // Real-time delivery
    const receiverSockets = onlineUsers.get(receiverId.toString());

    if (receiverSockets) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit("newMessage", {
          _id: message._id,
          conversationId,
          senderId,
          receiverId,
          content,
          createdAt: message.createdAt,
        });
      });

      logger.info("Message delivered in real-time", {
        receiverId,
        messageId: message._id,
      });
    }

    res.status(201).json({
      success: true,
      message,
    });
  } catch (err) {
    logger.error("Failed to send message", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.userId;

    logger.info("Fetching messages", {
      conversationId,
      userId,
      page,
      limit,
    });

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      logger.warn("Conversation not found while fetching messages", {
        conversationId,
        userId,
      });

      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Ensure user is part of conversation
    if (!conversation.participants.some(id => id.toString() === userId)) {
      logger.warn("Unauthorized message fetch attempt", {
        userId,
        conversationId,
      });

      return res.status(403).json({
        success: false,
        message: "You are not part of this conversation",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ conversationId });

    res.json({
      success: true,
      page: parseInt(page),
      total,
      count: messages.length,
      messages,
    });

  } catch (err) {
    logger.error("Failed to fetch messages", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};

const getUserConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    logger.info("Fetching user conversations", { userId });

    // Find all conversations where user is participant
    const conversations = await Conversation.find({
      participants: userId,
    }).lean();

    const response = [];

    for (const convo of conversations) {
      // Find the other user (1–1 chat assumption)
      const otherUserId = convo.participants.find(
        (id) => id.toString() !== userId
      );

      // Get last message
      const lastMessage = await Message.findOne({
        conversationId: convo._id,
      })
        .sort({ createdAt: -1 })
        .lean();

      // Count unread messages for current user
      const unreadCount = await Message.countDocuments({
        conversationId: convo._id,
        receiverId: userId,
        isRead: false,
      });

      response.push({
        conversationId: convo._id,
        otherUserId,
        lastMessage: lastMessage?.content || null,
        lastMessageTime: lastMessage?.createdAt || null,
        unreadCount,
      });
    }

    // Sort conversations by last message time (latest first)
    response.sort((a, b) => {
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });

    res.json({
      success: true,
      count: response.length,
      conversations: response,
    });

  } catch (err) {
    logger.error("Failed to fetch conversations", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    logger.info("Mark messages as read request", {
      userId,
      conversationId,
    });

    // Update unread messages where current user is receiver
    const result = await Message.updateMany(
      {
        conversationId,
        receiverId: userId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    logger.info("Messages marked as read", {
      conversationId,
      modifiedCount: result.modifiedCount,
    });

    // Notify sender in real-time (optional but recommended)
    // Find distinct senders whose messages were read
    const senders = await Message.distinct("senderId", {
      conversationId,
      receiverId: userId,
    });

    senders.forEach((senderId) => {
      const senderSockets = onlineUsers.get(senderId.toString());

      if (senderSockets) {
        senderSockets.forEach((socketId) => {
          io.to(socketId).emit("messagesRead", {
            conversationId,
            readerId: userId,
          });
        });
      }
    });

    res.json({
      success: true,
      message: "Messages marked as read",
      modifiedCount: result.modifiedCount,
    });

  } catch (err) {
    logger.error("Failed to mark messages as read", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
    });
  }
};

module.exports = { createOrGetConversation, sendMessage, getMessages, getUserConversations, markMessagesAsRead };