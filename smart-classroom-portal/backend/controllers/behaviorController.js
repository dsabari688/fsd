const BehaviorLog = require("../models/BehaviorLog");
const Classroom = require("../models/Classroom");

// @route POST /api/behavior/manual
// A teacher marks each student's behavior directly.
// Body: { classroom, events: [{ student, behavior }] }
const markManualBehavior = async (req, res, next) => {
  try {
    const { classroom, events } = req.body;
    if (!classroom || !events || !Array.isArray(events)) {
      return res.status(400).json({ message: "classroom and events[] are required" });
    }

    const tenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    let log = await BehaviorLog.findOne({
      classroom,
      capturedAt: { $gte: tenMinutesAgo },
    }).sort({ capturedAt: -1 });

    if (log) {
      log.events = events;
      log.capturedAt = Date.now();
      await log.save();
    } else {
      log = await BehaviorLog.create({
        classroom,
        capturedAt: Date.now(),
        events,
      });
    }

    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

// @route GET /api/behavior?classroom=&date=
const getBehaviorLogs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.classroom) filter.classroom = req.query.classroom;
    const logs = await BehaviorLog.find(filter)
      .populate("classroom", "name section")
      .populate("events.student", "name rollNumber")
      .sort({ capturedAt: -1 });
    res.json(logs);
  } catch (err) {
    next(err);
  }
};

// @route GET /api/behavior/summary/:classroomId
// Basic per-student behavior breakdown (counts per behavior type)
const getClassroomBehaviorSummary = async (req, res, next) => {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findById(classroomId).populate("students", "name rollNumber");
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });

    const logs = await BehaviorLog.find({ classroom: classroomId });

    const summary = classroom.students.map((student) => {
      const counts = {
        studying: 0,
        attentive: 0,
        speaking: 0,
        talking: 0,
        sleeping: 0,
        phone_use: 0,
        distracted: 0,
        raising_hand: 0,
        unknown: 0,
      };
      logs.forEach((log) => {
        log.events
          .filter((e) => e.student && e.student.toString() === student._id.toString())
          .forEach((e) => {
            const b = e.behavior || "unknown";
            counts[b] = (counts[b] || 0) + 1;
          });
      });
      return { student: { _id: student._id, name: student.name, rollNumber: student.rollNumber }, counts };
    });

    res.json({ classroom: classroom.name, totalLogs: logs.length, summary });
  } catch (err) {
    next(err);
  }
};

module.exports = { markManualBehavior, getBehaviorLogs, getClassroomBehaviorSummary };
