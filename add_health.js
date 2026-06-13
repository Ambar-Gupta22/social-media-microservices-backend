const fs = require('fs');
const path = require('path');

const services = [
  'api-gateway', 'identity-service', 'post-service', 'comment-service', 
  'media-service', 'search-service', 'notification-service', 'chat-service'
];

services.forEach(service => {
  const serverPath = path.join(__dirname, service, 'src', 'server.js');
  if (!fs.existsSync(serverPath)) return;
  
  let content = fs.readFileSync(serverPath, 'utf8');

  // Add /health endpoint
  if (!content.includes('app.get("/health"')) {
    content = content.replace('app.use(errorHandler);', 'app.get("/health", (req, res) => res.json({ status: "ok" }));\napp.use(errorHandler);');
  }

  // Graceful shutdown logic
  let hasRabbitMQ = content.includes('rabbitmq');
  let hasMongoose = content.includes('mongoose');
  let hasRedis = content.includes('redis');
  
  // Make listen call return a server instance if not already done
  if (service !== 'chat-service') {
    if (!content.includes('const serverInstance = app.listen')) {
      content = content.replace('app.listen(PORT', 'const serverInstance = app.listen(PORT');
    }
  } else {
    // chat-service uses server.listen
    if (!content.includes('const serverInstance = server.listen')) {
      content = content.replace('server.listen(PORT', 'const serverInstance = server.listen(PORT');
    }
  }

  if (!content.includes('gracefulShutdown')) {
    let shutdownLogic = `
const gracefulShutdown = async () => {
  logger.info("Initiating graceful shutdown...");
  try {
    if (serverInstance) {
      serverInstance.close(() => logger.info("HTTP server closed."));
    }
    ${hasMongoose ? 'if (mongoose.connection.readyState === 1) await mongoose.connection.close();\n    logger.info("MongoDB connection closed.");' : ''}
    process.exit(0);
  } catch (err) {
    logger.error("Shutdown error", err);
    process.exit(1);
  }
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
`;
    content += shutdownLogic;
  }

  fs.writeFileSync(serverPath, content, 'utf8');
  console.log(`Updated ${service}`);
});
