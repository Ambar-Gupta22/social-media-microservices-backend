const { AsyncLocalStorage } = require("async_hooks");
const { v4: uuidv4 } = require("uuid");

const asyncLocalStorage = new AsyncLocalStorage();

const correlationMiddleware = (req, res, next) => {
  let correlationId = req.headers["x-request-id"];
  
  if (!correlationId) {
    correlationId = uuidv4();
    req.headers["x-request-id"] = correlationId;
  }
  
  res.setHeader("x-request-id", correlationId);
  
  asyncLocalStorage.run(correlationId, () => {
    next();
  });
};

const getCorrelationId = () => {
  return asyncLocalStorage.getStore();
};

module.exports = { correlationMiddleware, getCorrelationId };
