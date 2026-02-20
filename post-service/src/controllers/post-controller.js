const Post = require("../models/Post");
const logger = require("../utils/logger");
const { publishEvent } = require("../utils/rabbitmq");
const { validateCreatePost } = require("../utils/validation");

async function getPostsCacheVersion(redis) {
  const version = await redis.get("posts:version");
  return version || 1;
}

async function bumpPostsCacheVersion(redis) {
  await redis.incr("posts:version");
}

/* ---------------- CREATE POST ---------------- */
const createPost = async (req, res) => {
  try {
    const { error } = validateCreatePost(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { content, mediaIds } = req.body;

    const post = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await post.save();

    await publishEvent("post.created", {
      postId: post._id.toString(),
      userId: post.user.toString(),
      content: post.content,
      createdAt: post.createdAt,
    });

    // invalidate feed cache (version bump)
    await bumpPostsCacheVersion(req.redisClient);

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    });
  } catch (e) {
    logger.error("Error creating post", e);
    res.status(500).json({
      success: false,
      message: "Error creating post",
    });
  }
};

/* ---------------- GET ALL POSTS ---------------- */
const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const version = await getPostsCacheVersion(req.redisClient);
    const cacheKey = `posts:v${version}:${page}:${limit}`;

    const cached = await req.redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments();

    const result = {
      posts,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
    };

    await req.redisClient.setex(cacheKey, 300, JSON.stringify(result));

    res.json(result);
  } catch (e) {
    logger.error("Error fetching posts", e);
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
    });
  }
};

/* ---------------- GET SINGLE POST ---------------- */
const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const cacheKey = `post:${postId}`;

    const cached = await req.redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    await req.redisClient.setex(
      cacheKey,
      3600,
      JSON.stringify(post)
    );

    res.json(post);
  } catch (e) {
    logger.error("Error fetching post", e);
    res.status(500).json({
      success: false,
      message: "Error fetching post",
    });
  }
};

/* ---------------- DELETE POST ---------------- */
const deletePost = async (req, res) => {
  try {
    const post = await Post.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // delete single post cache
    await req.redisClient.del(`post:${req.params.id}`);

    // publishEvent("post.deleted", { postId: req.params.id });
    await publishEvent("post.deleted", {
      postId: post._id.toString(),
      userId: req.user.userId,
      mediaIds: post.mediaIds,
    });

    // invalidate feed cache
    await bumpPostsCacheVersion(req.redisClient);

    res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (e) {
    logger.error("Error deleting post", e);
    res.status(500).json({
      success: false,
      message: "Error deleting post",
    });
  }
};

const likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const actorId = req.user.userId;

    // fetch post owner ONLY
    const post = await Post.findById(postId).select("user");
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // prevent self-like notification later
    const receiverId = post.user.toString();

    const result = await Post.updateOne(
      { _id: postId, 
        "likes.userId": { $ne: actorId } 
      },
      { $push: { likes: { userId: actorId } } }
    );

    if (result.matchedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Post not found or already liked",
      });
    }

    // emit event ONLY if actor != receiver
    if (actorId !== receiverId) {
      await publishEvent("post.liked", {
        type: "POST_LIKED",
        receiverId,
        actorId,
        postId,
      });
    }

    await req.redisClient.del(`post:${postId}`);
    await req.redisClient.incr("posts:version");

    res.json({ success: true, message: "Post liked successfully" });
  } catch (e) {
    logger.error("Error liking post", e);
    res.status(500).json({ success: false, message: "Error liking post" });
  }
};

const unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;

    const result = await Post.updateOne(
      { _id: postId },
      { $pull: { likes: { userId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Post not liked yet or not found",
      });
    }

    // await publishEvent("post.unliked", { postId, userId });

    await req.redisClient.del(`post:${postId}`);
    await req.redisClient.incr("posts:version");

    res.json({ success: true, message: "Post unliked successfully" });
  } catch (e) {
    logger.error("Error unliking post", e);
    res.status(500).json({ success: false, message: "Error unliking post" });
  }
};

module.exports = { createPost , getAllPosts, getPost, deletePost, likePost, unlikePost };