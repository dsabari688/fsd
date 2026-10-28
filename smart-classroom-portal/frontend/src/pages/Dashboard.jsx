import { useEffect, useState } from "react";
import api from "../api/api";

export default function Dashboard() {
  const [stats, setStats] = useState({ classrooms: 0, students: 0, sessions: 0 });
  const [dbStatus, setDbStatus] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [classroomsRes, studentsRes, attendanceRes, dbRes] = await Promise.all([
          api.get("/classrooms").catch(() => ({ data: [] })),
          api.get("/students").catch(() => ({ data: [] })),
          api.get("/attendance").catch(() => ({ data: [] })),
          api.get("/db-status").catch(() => ({ data: null })),
        ]);
        setStats({
          classrooms: Array.isArray(classroomsRes.data) ? classroomsRes.data.length : 0,
          students: Array.isArray(studentsRes.data) ? studentsRes.data.length : 0,
          sessions: Array.isArray(attendanceRes.data) ? attendanceRes.data.length : 0,
        });
        if (dbRes.data) {
          setDbStatus(dbRes.data);
        }
      } catch (err) {
        console.error("Dashboard data load error:", err);
      }
    };
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Smart Classroom & Attendance Analytics Portal Summary
          </p>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card bg-blue">
          <h3>Classrooms</h3>
          <p>{stats.classrooms}</p>
        </div>
        <div className="stat-card bg-green">
          <h3>Students</h3>
          <p>{stats.students}</p>
        </div>
        <div className="stat-card bg-orange">
          <h3>Attendance Sessions</h3>
          <p>{stats.sessions}</p>
        </div>
      </div>

      {/* Database & Storage Health Status */}
      <div
        className="card"
        style={{
          marginTop: 20,
          borderLeft: `5px solid ${dbStatus?.connected ? "#22c55e" : "#ef4444"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>{dbStatus?.connected ? "💾" : "⚠️"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                Database Connection & Persistence Status
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 12,
                    fontWeight: 700,
                    backgroundColor: dbStatus?.connected ? "#dcfce7" : "#fee2e2",
                    color: dbStatus?.connected ? "#15803d" : "#b91c1c",
                  }}
                >
                  {dbStatus?.connected ? "● ONLINE & PERSISTENT" : "● DISCONNECTED"}
                </span>
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                {dbStatus?.connected
                  ? "All created students, classrooms, and attendance data are permanently written to disk."
                  : "Database is unreachable. Please verify backend is running."}
              </p>
            </div>
          </div>

          {dbStatus?.connected && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#475569" }}>
              <div>
                <strong>Engine:</strong> WiredTiger (Disk)
              </div>
              <div>
                <strong>Port:</strong> {dbStatus.port || 27017}
              </div>
              <div>
                <strong>Retention:</strong> Permanent
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>About Smart Classroom Portal</h3>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Manage classrooms and students, take attendance via Computer Vision (FaceNet) or manually,
          and track behavioral analytics (YOLOv8) per session — all securely backed by a persistent MongoDB
          database engine.
        </p>
      </div>
    </div>
  );
}
