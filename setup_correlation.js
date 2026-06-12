const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const services = [
  'api-gateway', 'identity-service', 'post-service', 'comment-service', 
  'media-service', 'search-service', 'notification-service', 'chat-service'
];

execSync('npm install uuid', { cwd: path.join(__dirname, 'api-gateway'), stdio: 'inherit' });

services.forEach(service => {
  const servicePath = path.join(__dirname, service);
  
  // 1. Create src/utils/correlation.js
  const correlationCode = `const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();

const correlationMiddleware = (req, res, next) => {
  let correlationId = req.headers["x-request-id"];
  ${service === 'api-gateway' ? 'if (!correlationId) { const { v4: uuidv4 } = require("uuid"); correlationId = uuidv4(); req.headers["x-request-id"] = correlationId; }' : ''}
  res.setHeader("x-request-id", correlationId || "unknown");
  
  asyncLocalStorage.run(correlationId || "unknown", () => {
    next();
  });
};

const getCorrelationId = () => {
  return asyncLocalStorage.getStore();
};

module.exports = { correlationMiddleware, getCorrelationId };
`;
  fs.writeFileSync(path.join(servicePath, 'src', 'utils', 'correlation.js'), correlationCode, 'utf8');

  // 2. Update logger.js to use it
  const loggerPath = path.join(servicePath, 'src', 'utils', 'logger.js');
  let loggerCode = fs.readFileSync(loggerPath, 'utf8');
  
  if (!loggerCode.includes('getCorrelationId')) {
    loggerCode = loggerCode.replace('const winston = require("winston");', 
      'const winston = require("winston");\nconst { getCorrelationId } = require("./correlation");\n\nconst correlationFormat = winston.format((info) => {\n  const correlationId = getCorrelationId();\n  if (correlationId) {\n    info.correlationId = correlationId;\n  }\n  return info;\n});\n'
    );
    
    loggerCode = loggerCode.replace('winston.format.timestamp(),', 
      'winston.format.timestamp(),\n    correlationFormat(),'
    );
    
    fs.writeFileSync(loggerPath, loggerCode, 'utf8');
  }

  // 3. Update server.js to use correlationMiddleware BEFORE other middlewares
  const serverPath = path.join(servicePath, 'src', 'server.js');
  let serverCode = fs.readFileSync(serverPath, 'utf8');
  
  if (!serverCode.includes('correlationMiddleware')) {
    serverCode = serverCode.replace('const logger = require("./utils/logger");', 
      'const logger = require("./utils/logger");\nconst { correlationMiddleware } = require("./utils/correlation");'
    );
    
    serverCode = serverCode.replace('app.use(express.json());', 
      'app.use(express.json());\napp.use(correlationMiddleware);'
    );
    
    if (service === 'api-gateway') {
      serverCode = serverCode.replace(
        /proxyReqOptDecorator: \(proxyReqOpts, srcReq\) => {/g,
        'proxyReqOptDecorator: (proxyReqOpts, srcReq) => {\n      proxyReqOpts.headers["x-request-id"] = srcReq.headers["x-request-id"];'
      );
    }
    
    fs.writeFileSync(serverPath, serverCode, 'utf8');
  }
  
  // 4. Update rabbitmq.js to include correlationId in payload
  const rabbitmqPath = path.join(servicePath, 'src', 'utils', 'rabbitmq.js');
  if (fs.existsSync(rabbitmqPath)) {
    let rabbitCode = fs.readFileSync(rabbitmqPath, 'utf8');
    if (!rabbitCode.includes('getCorrelationId') && rabbitCode.includes('publishEvent')) {
      rabbitCode = rabbitCode.replace('const logger = require("./logger");', 
        'const logger = require("./logger");\nconst { getCorrelationId } = require("./correlation");'
      );
      
      rabbitCode = rabbitCode.replace(
        'async function publishEvent(routingKey, message) {',
        'async function publishEvent(routingKey, message) {\n  const correlationId = getCorrelationId();\n  if (correlationId) {\n    message.correlationId = correlationId;\n  }'
      );
      
      fs.writeFileSync(rabbitmqPath, rabbitCode, 'utf8');
    }
  }

  console.log(`Setup correlation ID for ${service}`);
});
