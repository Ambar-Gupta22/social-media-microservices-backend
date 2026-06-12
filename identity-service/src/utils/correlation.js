const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();

const correlationMiddleware = (req, res, next) => {
  let correlationId = req.headers["x-request-id"];
  
  res.setHeader("x-request-id", correlationId || "unknown");
  
  asyncLocalStorage.run(correlationId || "unknown", () => {
    next();
  });
};

const getCorrelationId = () => {
  return asyncLocalStorage.getStore();
};

module.exports = { correlationMiddleware, getCorrelationId };
