require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { register, metricsMiddleware } = require("@social-media/shared");
const { logger } = require("@social-media/shared");
const { correlationMiddleware } = require("@social-media/shared");
const proxy = require("express-http-proxy");
const { errorHandler } = require("@social-media/shared");
const { validateToken } = require("@social-media/shared");

const app = express();
const PORT = process.env.PORT || 3000;

const redisClient = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(cors());
app.use(correlationMiddleware);
app.use(metricsMiddleware("api-gateway"));

//rate limiting
const ratelimitOptions = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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

app.use(ratelimitOptions);

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  next();
});

const proxyOptions = {
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },
  proxyErrorHandler: (err, res, next) => {
    logger.error(`Proxy error: ${err.message}`);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({
      message: `Internal server error`,
      error: err.message,
    });
  },
};

//setting up proxy for our identity service
app.use(
  "/v1/auth",
  proxy(process.env.IDENTITY_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Identity service: ${proxyRes.statusCode}`
      );

      return proxyResData;
    },
    parseReqBody: false,
  })
);

//setting up proxy for our post service
app.use(
  "/v1/posts",
  validateToken,
  proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,

    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["authorization"] = srcReq.headers["authorization"]; 
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData) => {
      logger.info(
        `Response received from Post service: ${proxyRes.statusCode}`
      );
      return proxyResData;
    },
    parseReqBody: false,
  })
);

app.use(
  "/v1/comments",
  validateToken,
  proxy(process.env.COMMENT_SERVICE_URL, {
    ...proxyOptions,

    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["authorization"] = srcReq.headers["authorization"]; 
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },

    userResDecorator: (proxyRes, proxyResData) => {
      logger.info(
        `Response received from Comment service: ${proxyRes.statusCode}`
      );
      return proxyResData;
    },
    parseReqBody: false,
  })
);

// setting up proxy for our media service
app.use(
  "/v1/media",
  validateToken,
  proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      if (!srcReq.headers["content-type"]?.startsWith("multipart/form-data")) {
        proxyReqOpts.headers["Content-Type"] = "application/json";
      }

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from media service: ${proxyRes.statusCode}`
      );

      return proxyResData;
    },
    parseReqBody: false,
  })
);

// setting up proxy for our search service
app.use(
  "/v1/search",
  validateToken,
  proxy(process.env.SEARCH_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Search service: ${proxyRes.statusCode}`
      );

      return proxyResData;
    },
    parseReqBody: false,
  })
);

// setting up proxy for our notification service
app.use(
  "/v1/notifications",
  validateToken,
  proxy(process.env.NOTIFICATION_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Notification service: ${proxyRes.statusCode}`
      );

      return proxyResData;
    },
    parseReqBody: false,
  })
);

// setting up proxy for our chat service
app.use(
  "/v1/chat",
  validateToken,
  proxy(process.env.CHAT_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Chat service: ${proxyRes.statusCode}`
      );

      return proxyResData;
    },
    parseReqBody: false,
  })
);

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(errorHandler);

const serverInstance = app.listen(PORT, () => {
  logger.info(`API Gateway is running on port ${PORT}`);
  logger.info(
    `Identity service is running on port ${process.env.IDENTITY_SERVICE_URL}`
  );
  logger.info(
    `Post service is running on port ${process.env.POST_SERVICE_URL}`
  );
  logger.info(
    `Comment service is running on port ${process.env.COMMENT_SERVICE_URL}`
  );
  logger.info(
    `Media service is running on port ${process.env.MEDIA_SERVICE_URL}`
  );
  logger.info(
    `Search service is running on port ${process.env.SEARCH_SERVICE_URL}`
  );
  logger.info(
    `Notification service is running on port ${process.env.NOTIFICATION_SERVICE_URL}`
  );
  logger.info(
    `Chat service is running on port ${process.env.CHAT_SERVICE_URL}`
  );
  logger.info(`Redis Url ${process.env.REDIS_URL}`);
});
const gracefulShutdown = async () => {
  logger.info("Initiating graceful shutdown...");
  try {
    if (serverInstance) {
      serverInstance.close(() => logger.info("HTTP server closed."));
    }
    
    process.exit(0);
  } catch (err) {
    logger.error("Shutdown error", err);
    process.exit(1);
  }
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
