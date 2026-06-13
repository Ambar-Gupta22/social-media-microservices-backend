const amqp = require("amqplib");
const logger = require("./logger");
const { getCorrelationId } = require("./correlation");
const { rabbitmqEventsPublishedTotal, rabbitmqEventsConsumedTotal } = require("./metrics");

let serviceName = "unknown-service";
try {
  const path = require("path");
  const pkgName = require(path.join(process.cwd(), "package.json")).name;
  if (pkgName) serviceName = pkgName;
} catch (err) {}

let connection = null;
let channel = null;

const EXCHANGE_NAME = "facebook_events";

async function connectToRabbitMQ(retries = 5) {
  while (retries > 0) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL);
      
      connection.on("error", (err) => {
        logger.error("RabbitMQ connection error", err);
      });
      
      connection.on("close", () => {
        logger.warn("RabbitMQ connection closed. Reconnecting...");
        setTimeout(() => connectToRabbitMQ(), 5000);
      });

      channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
      logger.info("Connected to RabbitMQ");
      return channel;
    } catch (e) {
      retries -= 1;
      logger.error(`Error connecting to RabbitMQ. Retries left: ${retries}`, e);
      if (retries === 0) {
        logger.error("Could not connect to RabbitMQ. Exiting...");
        process.exit(1);
      }
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

async function publishEvent(routingKey, message) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  const correlationId = getCorrelationId();
  if (correlationId) {
    message.correlationId = correlationId;
  }

  channel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(JSON.stringify(message))
  );
  logger.info(`Event published: ${routingKey}`);
  rabbitmqEventsPublishedTotal.inc({ routing_key: routingKey, service: serviceName });
}

async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  const queueName = `${serviceName}.${routingKey}`;
  const q = await channel.assertQueue(queueName, { exclusive: false, durable: true });
  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);
  
  channel.consume(q.queue, (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      callback(content);
      channel.ack(msg);
      rabbitmqEventsConsumedTotal.inc({ routing_key: routingKey, service: serviceName });
    }
  });

  logger.info(`Subscribed to event: ${routingKey} on durable queue: ${queueName}`);
}

module.exports = { connectToRabbitMQ, publishEvent, consumeEvent };
