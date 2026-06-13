const express = require("express");
const multer = require("multer");

const {
  uploadMedia,
  getAllMedias,
} = require("../controllers/media-controller");
const { authenticateRequest } = require("@social-media/shared");
const { logger } = require("@social-media/shared");

const router = express.Router();

//configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images, videos, and audio are allowed."), false);
    }
  },
}).single("file");

router.post(
  "/upload",
  authenticateRequest,
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        logger.error("Multer error while uploading:", err);
        return res.status(400).json({
          message: "Multer error while uploading:",
          error: err.message,
        });
      } else if (err) {
        logger.error("Unknown error occured while uploading:", err);
        return res.status(500).json({
          message: "Unknown error occured while uploading:",
          error: err.message,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "No file found!",
        });
      }

      next();
    });
  },
  uploadMedia
);

router.get("/get", authenticateRequest, getAllMedias);

module.exports = router;