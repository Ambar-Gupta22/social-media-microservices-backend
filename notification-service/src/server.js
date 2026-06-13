require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const notificationRoutes = require("./routes/notification-routes");
const { errorHandler } = require("@social-media/shared");
const { logger } = require("@social-media/shared");
const { correlationMiddleware } = require("@social-media/shared");
const { connectToRabbitMQ, consumeEvent } = require("@social-media/shared");
const { handlePostLiked, handlePostCommented, handleMessageReceived} = require("./eventHandlers/notification-event-handlers");

const app = express();
const PORT = process.env.PORT || 3006;

// Mongo
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

// Routes
app.use("/api/notifications", notificationRoutes);

// Error handler (ONCE, at the end)
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    await consumeEvent("post.liked", handlePostLiked);
    await consumeEvent("post.commented", handlePostCommented);
    await consumeEvent("message.sent", handleMessageReceived);

    const serverInstance = app.listen(PORT, () => {
      logger.info(`Notification service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start notification service", error);
    process.exit(1);
  }
}

startServer();

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", reason);
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
