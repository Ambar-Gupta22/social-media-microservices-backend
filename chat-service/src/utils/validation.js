const Joi = require("joi");

const sendMessageSchema = Joi.object({
  conversationId: Joi.string().required(),
  content: Joi.string().min(1).max(1000).required(),
});

function validateSendMessage(data) {
  return sendMessageSchema.validate(data, {
    abortEarly: true,
  });
}

module.exports = { validateSendMessage };