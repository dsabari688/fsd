const Student = require("../models/Student");
const Classroom = require("../models/Classroom");

const createStudent = async (req, res, next) => {
  try {
    const { rollNumber, name, email, classroom, photoUrl } = req.body;
    if (!rollNumber || !name) {
      return res.status(400).json({ message: "rollNumber and name are required" });
    }
    const student = await Student.create({
      rollNumber,
      name,
      email,
      classroom: classroom ? classroom : undefined,
      photoUrl,
    });

    if (classroom) {
      await Classroom.findByIdAndUpdate(classroom, { $addToSet: { students: student._id } });
    }
    res.status(201).json(student);
  } catch (err) {
    next(err);
  }
};

const getStudents = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.classroom) filter.classroom = req.query.classroom;
    const students = await Student.find(filter).populate("classroom", "name section");
    res.json(students);
  } catch (err) {
    next(err);
  }
};

const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).populate("classroom", "name section");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    next(err);
  }
};

const updateStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    next(err);
  }
};

const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json({ message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { createStudent, getStudents, getStudentById, updateStudent, deleteStudent };
