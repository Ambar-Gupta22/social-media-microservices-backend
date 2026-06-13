const promClient = require("prom-client");
const logger = require("./logger");

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, Memory, Event Loop)
promClient.collectDefaultMetrics({ register });

// Histogram for HTTP request duration
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code", "service"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDurationMicroseconds);

// Counter for total HTTP requests
const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code", "service"],
});
register.registerMetric(httpRequestsTotal);

// Gauge for active HTTP requests
const httpRequestsActive = new promClient.Gauge({
  name: "http_requests_active",
  help: "Number of active HTTP requests",
  labelNames: ["method", "route", "service"],
});
register.registerMetric(httpRequestsActive);

// RabbitMQ Metrics
const rabbitmqEventsPublishedTotal = new promClient.Counter({
  name: "rabbitmq_events_published_total",
  help: "Total number of events published to RabbitMQ",
  labelNames: ["routing_key", "service"],
});
register.registerMetric(rabbitmqEventsPublishedTotal);

const rabbitmqEventsConsumedTotal = new promClient.Counter({
  name: "rabbitmq_events_consumed_total",
  help: "Total number of events consumed from RabbitMQ",
  labelNames: ["routing_key", "service"],
});
register.registerMetric(rabbitmqEventsConsumedTotal);

/**
 * Express middleware to collect HTTP metrics
 * @param {string} serviceName - Name of the service (e.g., 'identity-service')
 */
const metricsMiddleware = (serviceName) => {
  return (req, res, next) => {
    // Exclude /health and /metrics endpoints from metrics
    if (req.path === "/health" || req.path === "/metrics") {
      return next();
    }

    const startEpoch = Date.now();
    const route = req.route ? req.route.path : req.path;

    httpRequestsActive.inc({ method: req.method, route, service: serviceName });

    res.on("finish", () => {
      const responseTimeInSeconds = (Date.now() - startEpoch) / 1000;

      httpRequestsActive.dec({ method: req.method, route, service: serviceName });

      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode,
        service: serviceName,
      });

      httpRequestDurationMicroseconds.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode,
          service: serviceName,
        },
        responseTimeInSeconds
      );
    });

    next();
  };
};

module.exports = {
  register,
  metricsMiddleware,
  rabbitmqEventsPublishedTotal,
  rabbitmqEventsConsumedTotal,
};
