const Comment = require("../models/Comment");
const logger = require("../utils/logger");
const { validateCreateComment } = require("../utils/validation");
const { publishEvent } = require("../utils/rabbitmq"); 

/**
 * CREATE COMMENT
 * POST /api/comments/create-comment
 */
const createComment = async (req, res) => {
  try {
    // Validate input
    const { error } = validateCreateComment(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { postId, postOwnerId, text } = req.body;
    const actorId = req.user.userId;

    // Create comment
    const comment = await Comment.create({
      postId,
      userId: actorId,
      postOwnerId,
      text,
    });

    // Emit event (no self-notification)
    if (actorId !== postOwnerId) {
      await publishEvent("post.commented", {
        type: "POST_COMMENTED",
        receiverId: postOwnerId,
        actorId,
        postId,
        commentId: comment._id.toString(),
      });
    }

    res.status(201).json({
      success: true,
      message: "Comment created successfully",
      comment,
    });
  } catch (e) {
    logger.error("Error creating comment", e);
    res.status(500).json({
      success: false,
      message: "Error creating comment",
    });
  }
};

/**
 * DELETE COMMENT
 * DELETE /api/comments/:commentId
 */
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await Comment.findOneAndDelete({
      _id: commentId,
      userId, // ownership check
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found or not authorized",
      });
    }

    // Event-driven update (later)
    // await publishEvent("comment.deleted", {
    //   postId: comment.postId.toString(),
    //   commentId: comment._id.toString(),
    //   userId,
    // });

    res.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (e) {
    logger.error("Error deleting comment", e);
    res.status(500).json({
      success: false,
      message: "Error deleting comment",
    });
  }
};

/**
 * GET COMMENTS BY POST (Paginated)
 * GET /api/comments/post/:postId?page=1&limit=10
 */
const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({ postId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalComments = await Comment.countDocuments({ postId });

    res.json({
      success: true,
      comments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
      },
    });
  } catch (e) {
    logger.error("Error fetching comments", e);
    res.status(500).json({
      success: false,
      message: "Error fetching comments",
    });
  }
};

module.exports = { createComment, deleteComment, getCommentsByPost };