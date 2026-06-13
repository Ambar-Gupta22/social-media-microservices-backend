require("dotenv").config();
const mongoose = require("mongoose");
const { register, metricsMiddleware } = require("@social-media/shared");
const { logger } = require("@social-media/shared");
const { correlationMiddleware } = require("@social-media/shared");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const Redis = require("ioredis");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const routes = require("./routes/identity-service");
const { errorHandler } = require("@social-media/shared");

const app = express();
const PORT = process.env.PORT || 3001;

//connect to mongodb
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => logger.info("Connected to mongodb"))
  .catch((e) => logger.error("Mongo connection error", e));

const redisClient = new Redis(process.env.REDIS_URL);

//middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware);
app.use(metricsMiddleware("identity-service"));

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  next();
});

//DDos protection and rate limiting
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: 10,
  duration: 1,
});

app.use((req, res, next) => {
  rateLimiter
    .consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ success: false, message: "Too many requests" });
    });
});

//Ip based rate limiting for sensitive endpoints
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ success: false, message: "Too many requests" });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

//apply this sensitiveEndpointsLimiter to our routes
app.use("/api/auth/register", sensitiveEndpointsLimiter);

//Routes
app.use("/api/auth", routes);

//error handler
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(errorHandler);

const serverInstance = app.listen(PORT, () => {
  logger.info(`Identity service running on port ${PORT}`);
});

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
