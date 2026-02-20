require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatRoutes = require("./routes/chat-routes");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ } = require("./utils/rabbitmq");

const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.io
const PORT = process.env.PORT || 3007;

/**
 * Initialize Socket.io
 */
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

/**
 * Multi-tab safe online users map
 * userId → Set(socketIds)
 */
const onlineUsers = new Map();

/**
 * Socket Authentication Middleware
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

/**
 * Socket Connection Handling
 */
io.on("connection", (socket) => {
  const userId = socket.userId;

  logger.info("User connected via socket", { userId });

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }

  onlineUsers.get(userId).add(socket.id);

  socket.on("disconnect", () => {
    logger.info("User disconnected", { userId });

    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }
  });
});

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("Connected to MongoDB"))
  .catch((e) => logger.error("Mongo connection error", e));

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use("/api/chat", chatRoutes);

// Error handler
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    server.listen(PORT, () => {
      logger.info(`Chat service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to connect to server", error);
    process.exit(1);
  }
}

startServer();

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

/**
 * Export for controller usage
 */
module.exports = { io, onlineUsers };