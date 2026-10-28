const express = require("express");
const {
  markManualBehavior,
  getBehaviorLogs,
  getClassroomBehaviorSummary,
} = require("../controllers/behaviorController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/manual", protect, markManualBehavior);
router.get("/", protect, getBehaviorLogs);
router.get("/summary/:classroomId", protect, getClassroomBehaviorSummary);

module.exports = router;
