const express = require("express");
const { searchPostController } = require("../controllers/search-controller");
const { authenticateRequest } = require("@social-media/shared");

const router = express.Router();

router.use(authenticateRequest);

router.get("/posts", searchPostController);

module.exports = router;