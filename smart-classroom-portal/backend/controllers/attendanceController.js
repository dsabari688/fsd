const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");

// @route POST /api/attendance/manual
// Body: { classroom, date, records: [{ student, status }] }
const markManualAttendance = async (req, res, next) => {
  try {
    const { classroom, date, records } = req.body;
    if (!classroom || !records || !Array.isArray(records)) {
      return res.status(400).json({ message: "classroom and records[] are required" });
    }

    const sessionDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(sessionDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(sessionDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Look for an existing session for this classroom today
    let attendance = await Attendance.findOne({
      classroom,
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ date: -1 });

    if (attendance) {
      // Merge records: preserve present status and update incoming statuses
      const recordMap = new Map();
      (attendance.records || []).forEach((r) => {
        if (r.student) recordMap.set(r.student.toString(), r.status);
      });

      records.forEach((r) => {
        const sId = r.student ? (r.student._id || r.student).toString() : null;
        if (sId) {
          if (r.status === "present" || !recordMap.has(sId)) {
            recordMap.set(sId, r.status);
          }
        }
      });

      attendance.records = Array.from(recordMap.entries()).map(([student, status]) => ({
        student,
        status,
      }));
      attendance.date = sessionDate;
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        classroom,
        date: sessionDate,
        records,
        createdBy: req.user ? req.user._id : undefined,
      });
    }

    const populated = await Attendance.findById(attendance._id)
      .populate("classroom", "name section")
      .populate("records.student", "name rollNumber");

    res.status(200).json(populated);
  } catch (err) {
    next(err);
  }
};

// @route GET /api/attendance?classroom=&date=
const getAttendance = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.classroom) filter.classroom = req.query.classroom;
    if (req.query.date) {
      const start = new Date(req.query.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(req.query.date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    const attendance = await Attendance.find(filter)
      .populate("classroom", "name section")
      .populate("records.student", "name rollNumber")
      .sort({ date: -1 });
    res.json(attendance);
  } catch (err) {
    next(err);
  }
};

// @route GET /api/attendance/analytics/:classroomId
// Basic per-student attendance percentage for a classroom
const getClassroomAnalytics = async (req, res, next) => {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findById(classroomId).populate("students", "name rollNumber");
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });

    const sessions = await Attendance.find({ classroom: classroomId });
    const totalSessions = sessions.length;

    const summary = classroom.students.map((student) => {
      const presentCount = sessions.filter((s) =>
        s.records.some(
          (r) => r.student.toString() === student._id.toString() && r.status === "present"
        )
      ).length;
      const percentage = totalSessions ? Math.round((presentCount / totalSessions) * 100) : 0;
      return {
        student: { _id: student._id, name: student.name, rollNumber: student.rollNumber },
        presentCount,
        totalSessions,
        percentage,
      };
    });

    res.json({ classroom: classroom.name, totalSessions, summary });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  markManualAttendance,
  getAttendance,
  getClassroomAnalytics,
};
