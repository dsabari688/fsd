const express = require("express");
const {
  createClassroom,
  getClassrooms,
  getClassroomById,
  updateClassroom,
  deleteClassroom,
} = require("../controllers/classroomController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").post(protect, createClassroom).get(protect, getClassrooms);
router
  .route("/:id")
  .get(protect, getClassroomById)
  .put(protect, updateClassroom)
  .delete(protect, deleteClassroom);

module.exports = router;
