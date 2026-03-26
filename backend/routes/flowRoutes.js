const express = require("express");

const { protect } = require("../middleware/authMiddleware");
const { listFlows, saveFlow, getFlow, executeFlow } = require("../controllers/flowController");

const router = express.Router();

router.get("/flows", protect, listFlows);
router.post("/flows", protect, saveFlow);
router.get("/flows/:flowId", protect, getFlow);
router.post("/flows/:flowId/execute", protect, executeFlow);

module.exports = router;

