const logger = require('./utils/logger');
const { connectToRabbitMQ, publishEvent, consumeEvent } = require('./utils/rabbitmq');
const { correlationMiddleware, getCorrelationId } = require('./utils/correlation');
const errorHandler = require('./middleware/errorHandler');
const { authenticateRequest, validateToken } = require('./middleware/authMiddleware');
const { register, metricsMiddleware } = require('./utils/metrics');
module.exports = {
  logger,
  connectToRabbitMQ,
  publishEvent,
  consumeEvent,
  correlationMiddleware,
  getCorrelationId,
  errorHandler,
  authenticateRequest,
  validateToken,
  register,
  metricsMiddleware
};
