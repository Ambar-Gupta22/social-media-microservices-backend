const express = require("express");
const { createOrGetConversation, sendMessage, getMessages, getUserConversations, markMessagesAsRead } = require("../controllers/chat-controller");
const { authenticateRequest } = require("@social-media/shared");

const router = express.Router();

router.use(authenticateRequest);

router.post("/conversation", createOrGetConversation);
router.post("/send-message", sendMessage);
router.get("/messages/:conversationId", getMessages);
router.get("/conversations", getUserConversations);
router.post("/conversations/:conversationId/read", markMessagesAsRead);

module.exports = router;