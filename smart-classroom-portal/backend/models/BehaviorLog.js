const mongoose = require("mongoose");

// One recorded behavior for one student, at one point in time.
// Entered manually by a teacher.
const behaviorEventSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    behavior: {
      type: String,
      enum: [
        "attentive",
        "studying",
        "sleeping",
        "distracted",
        "talking",
        "speaking",
        "phone_use",
        "raising_hand",
        "unknown",
      ],
      default: "unknown",
    },
  },
  { _id: false }
);

const behaviorLogSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    capturedAt: { type: Date, required: true, default: Date.now },
    events: [behaviorEventSchema],
  },
  { timestamps: true }
);

behaviorLogSchema.index({ classroom: 1, capturedAt: 1 });

module.exports = mongoose.model("BehaviorLog", behaviorLogSchema);
