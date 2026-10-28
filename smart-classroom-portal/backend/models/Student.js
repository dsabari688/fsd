const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom" },
    photoUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
