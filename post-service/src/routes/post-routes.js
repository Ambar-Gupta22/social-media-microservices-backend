const express = require("express");
const {
  createPost,
  getAllPosts,
  getPost,
  deletePost,
  likePost,
  unlikePost,
} = require("../controllers/post-controller");

const { authenticateRequest } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateRequest);

// -------------------- POSTS --------------------

router.post("/create-post", createPost);
router.get("/all-posts", getAllPosts);
router.get("/:id", getPost);
router.delete("/:id", deletePost);

// -------------------- LIKES --------------------

router.post("/:id/like", likePost);
router.post("/:id/unlike", unlikePost);

module.exports = router;