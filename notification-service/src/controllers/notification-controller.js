const Notification = require("../models/Notification");
const { logger } = require("@social-media/shared");

/**
 * GET /notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    logger.debug("Fetching notifications", { userId, page, limit });

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      page,
      count: notifications.length,
      notifications,
    });
  } catch (err) {
    logger.error("Failed to fetch notifications", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

/**
 * PATCH /notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;

    logger.debug("Marking notification as read", {
      userId,
      notificationId,
    });

    const updated = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true }
    );

    if (!updated) {
      logger.warn("Notification not found or access denied", {
        userId,
        notificationId,
      });

      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (err) {
    logger.error("Failed to mark notification as read", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
      notificationId: req.params?.id,
    });

    res.status(500).json({
      success: false,
      message: "Failed to update notification",
    });
  }
};

/**
 * PATCH /notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    logger.debug("Marking all notifications as read", { userId });

    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    logger.info("Marked all notifications as read", {
      userId,
      modifiedCount: result.modifiedCount,
    });

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (err) {
    logger.error("Failed to mark all notifications as read", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
};

/**
 * GET /notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    logger.debug("Fetching unread notification count", { userId });

    const count = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    res.json({
      success: true,
      unreadCount: count,
    });
  } catch (err) {
    logger.error("Failed to fetch unread notification count", {
      error: err.message,
      stack: err.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, getUnreadCount };
