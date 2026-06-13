const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const authenticateRequest = (req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    logger.warn(`Access attempted without user ID`);
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  req.user = { userId };
  next();
};

const validateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logger.warn("Access attempt without valid token!");
    return res.status(401).json({
      message: "Authentication required",
      success: false,
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn("Invalid token!");
      return res.status(401).json({
        message: "Invalid token!",
        success: false,
      });
    }

    req.user = user;
    next();
  });
};

module.exports = { authenticateRequest, validateToken };
