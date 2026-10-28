const Classroom = require("../models/Classroom");

const createClassroom = async (req, res, next) => {
  try {
    const { name, section, subject, teacher } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Classroom name is required" });
    }
    const classroom = await Classroom.create({
      name: name.trim(),
      section: section ? section.trim() : "",
      subject: subject ? subject.trim() : "",
      teacher: teacher || (req.user ? req.user._id : undefined),
    });

    const populated = await Classroom.findById(classroom._id)
      .populate("teacher", "name email")
      .populate("students", "name rollNumber");

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

const getClassrooms = async (req, res, next) => {
  try {
    const classrooms = await Classroom.find()
      .populate("teacher", "name email")
      .populate("students", "name rollNumber")
      .sort({ createdAt: -1 });
    res.json(classrooms);
  } catch (err) {
    next(err);
  }
};

const getClassroomById = async (req, res, next) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate("teacher", "name email")
      .populate("students", "name rollNumber");
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    res.json(classroom);
  } catch (err) {
    next(err);
  }
};

const updateClassroom = async (req, res, next) => {
  try {
    const classroom = await Classroom.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    res.json(classroom);
  } catch (err) {
    next(err);
  }
};

const deleteClassroom = async (req, res, next) => {
  try {
    const classroom = await Classroom.findByIdAndDelete(req.params.id);
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    res.json({ message: "Classroom deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createClassroom,
  getClassrooms,
  getClassroomById,
  updateClassroom,
  deleteClassroom,
};
