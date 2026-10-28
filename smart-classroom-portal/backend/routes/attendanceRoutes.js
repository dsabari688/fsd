const express = require("express");
const {
  markManualAttendance,
  getAttendance,
  getClassroomAnalytics,
} = require("../controllers/attendanceController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/manual", protect, markManualAttendance);
router.get("/", protect, getAttendance);
router.get("/analytics/:classroomId", protect, getClassroomAnalytics);

module.exports = router;
