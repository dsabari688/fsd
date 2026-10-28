const express = require("express");
const {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
} = require("../controllers/studentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").post(protect, createStudent).get(protect, getStudents);
router
  .route("/:id")
  .get(protect, getStudentById)
  .put(protect, updateStudent)
  .delete(protect, deleteStudent);

module.exports = router;
