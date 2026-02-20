const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    ],
  },
  { timestamps: true }
);

/**
 * Ensure uniqueness of 1–1 conversation
 */
conversationSchema.index(
  { participants: 1 },
  { unique: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);