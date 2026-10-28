require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const classroomRoutes = require("./routes/classroomRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const behaviorRoutes = require("./routes/behaviorRoutes");
const visionRoutes = require("./routes/visionRoutes");

connectDB();

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.) or any localhost / 127.0.0.1 in dev
      if (!origin || origin.includes("localhost") || origin.includes("127.0.0.1") || origin === process.env.CLIENT_ORIGIN || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" })); // larger limit to allow base64 images later
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "smart-classroom-backend" });
});

app.get("/api/db-status", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const { getDBInfo } = require("./config/db");
    const Student = require("./models/Student");
    const Classroom = require("./models/Classroom");
    const Attendance = require("./models/Attendance");
    const BehaviorLog = require("./models/BehaviorLog");

    const dbInfo = getDBInfo();
    const isConnected = mongoose.connection.readyState === 1;
    let counts = { students: 0, classrooms: 0, attendance: 0, behavior: 0 };
    if (isConnected) {
      counts = {
        students: await Student.countDocuments().catch(() => 0),
        classrooms: await Classroom.countDocuments().catch(() => 0),
        attendance: await Attendance.countDocuments().catch(() => 0),
        behavior: await BehaviorLog.countDocuments().catch(() => 0),
      };
    }
    res.json({
      connected: isConnected,
      mode: dbInfo.mode,
      host: dbInfo.host,
      port: dbInfo.port,
      storagePath: dbInfo.storagePath,
      counts,
    });
  } catch (err) {
    res.json({
      connected: false,
      error: err.message,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/vision", visionRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
