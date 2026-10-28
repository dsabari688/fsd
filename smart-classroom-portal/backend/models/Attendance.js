const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    status: { type: String, enum: ["present", "absent", "late"], default: "present" },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    date: { type: Date, required: true, default: Date.now },
    records: [attendanceRecordSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.index({ classroom: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
