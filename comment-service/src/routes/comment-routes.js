const express = require("express");
const {
  createComment,
  deleteComment,
  getCommentsByPost,
} = require("../controllers/comment-controller");

const { authenticateRequest } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateRequest);

// POST /api/comments/create-comment
router.post("/create-comment", createComment);

// GET /api/comments/post/:postId?page=1&limit=10
router.get("/post/:postId", getCommentsByPost);

// DELETE /api/comments/:commentId
router.delete("/:commentId", deleteComment);

module.exports = router;