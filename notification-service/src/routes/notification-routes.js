const express = require("express");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} = require("../controllers/notification-controller");

const { authenticateRequest } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");

const router = express.Router();

router.use(authenticateRequest);

// rate limit ONLY fetching notifications
const getNotificationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${req.user.userId}`,
});

router.get("/all-notifications", getNotificationsLimiter, getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

module.exports = router;