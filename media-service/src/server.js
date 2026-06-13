require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const mediaRoutes = require("./routes/media-routes");
const { errorHandler } = require("@social-media/shared");
const { logger } = require("@social-media/shared");
const { correlationMiddleware } = require("@social-media/shared");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { connectToRabbitMQ, consumeEvent } = require("@social-media/shared");
const { handlePostDeleted } = require("./eventHandlers/media-event-handlers");

const app = express();
const PORT = process.env.PORT || 3004;

//connect to mongodb
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("Connected to mongodb"))
  .catch((e) => logger.error("Mongo connection error", e));

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(correlationMiddleware);

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  next();
});

// Rate limiter — only for create media
const createMediaLimiter = rateLimit({
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
      `Media upload rate limit exceeded for ${req.user?.userId || req.ip}`
    );
    res.status(429).json({
      success: false,
      message: "Too many media uploads, please try again later",
    });
  },
});

// Apply limiter only to upload media route
app.use("/api/media/upload", createMediaLimiter);

app.use("/api/media", mediaRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    //consume all the events
    await consumeEvent("post.deleted", handlePostDeleted);

    const serverInstance = app.listen(PORT, () => {
      logger.info(`Media service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to connect to server", error);
    process.exit(1);
  }
}

startServer();

//unhandled promise rejection

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at", promise, "reason:", reason);
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
