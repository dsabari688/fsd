const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Grade 10 - A"
    section: { type: String, trim: true },
    subject: { type: String, trim: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Classroom", classroomSchema);
