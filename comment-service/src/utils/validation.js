const Joi = require("joi");

const validateCreateComment = (data) => {
  const schema = Joi.object({
    postId: Joi.string().trim().hex().length(24).required(),
    postOwnerId: Joi.string().required(),
    text: Joi.string().trim().min(3).max(5000).required(),
  });

  return schema.validate(data);
};

module.exports = { validateCreateComment };
