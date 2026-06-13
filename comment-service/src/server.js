require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { connectToRabbitMQ } = require("@social-media/shared");

const commentRoutes = require("./routes/comment-routes");
const { errorHandler } = require("@social-media/shared");
const { logger } = require("@social-media/shared");
const { correlationMiddleware } = require("@social-media/shared");

const app = express();
const PORT = process.env.PORT || 3003;

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("Connected to MongoDB"))
  .catch((e) => logger.error("Mongo connection error", e));

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware);

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Rate limiter — only for create comment
const createCommentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    return ipKeyGenerator(req);
  },

  handler: (req, res) => {
    logger.warn(
      `Comment rate limit exceeded for ${req.user?.userId || req.ip}`
    );
    res.status(429).json({
      success: false,
      message: "Too many comments, please try again later",
    });
  },
});

// Apply limiter only to create-comment
app.use("/api/comments/create-comment", createCommentLimiter);

// Routes
app.use("/api/comments", commentRoutes);

// Error handler
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();
    const serverInstance = app.listen(PORT, () => {
      logger.info(`Comment service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to connect to server", error);
    process.exit(1);
  }
}

startServer();

// Unhandled promise rejection
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});
const gracefulShutdown = async () => {
  logger.info("Initiating graceful shutdown...");
  try {
    if (serverInstance) {
      serverInstance.close(() => logger.info("HTTP server closed."));
    }
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    logger.info("MongoDB connection closed.");
    process.exit(0);
  } catch (err) {
    logger.error("Shutdown error", err);
    process.exit(1);
  }
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
