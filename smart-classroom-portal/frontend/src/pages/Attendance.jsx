import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

const VISION_BASE = "http://localhost:5001/api/vision";

export default function Attendance() {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [students, setStudents] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [sessions, setSessions] = useState([]);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [message, setMessage] = useState("");
  const [visionStatus, setVisionStatus] = useState(null);

  useEffect(() => {
    api.get("/classrooms").then((res) => {
      setClassrooms(res.data);
      if (res.data.length > 0 && !selectedClassroom) {
        setSelectedClassroom(res.data[0]._id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedClassroom) {
      setStudents([]);
      return;
    }
    const classroom = classrooms.find((c) => c._id === selectedClassroom);
    setStudents(classroom?.students || []);
    setStatusMap({});
    loadSessions();
  }, [selectedClassroom, classrooms]);

  const loadSessions = () => {
    if (!selectedClassroom) return;
    api.get(`/attendance?classroom=${selectedClassroom}`).then((res) => {
      setSessions(res.data);
      if (res.data.length > 0) {
        setExpandedSessionId((prev) => prev || res.data[0]._id);
      }
    });
  };

  // Poll live computer vision status
  useEffect(() => {
    const fetchVision = async () => {
      try {
        let data;
        try {
          const res = await api.get("/vision/status");
          data = res.data;
        } catch {
          const raw = await fetch(`${VISION_BASE}/status`);
          data = await raw.json();
        }
        if (data) {
          setVisionStatus(data);
          // If live vision detects students, we can auto-fill statusMap
          if (data.present_students?.length > 0) {
            const detectedRolls = new Set(data.present_students);
            setStatusMap((prev) => {
              const updated = { ...prev };
              students.forEach((s) => {
                if (detectedRolls.has(s.rollNumber) && !prev[s._id]) {
                  updated[s._id] = "present";
                }
              });
              return updated;
            });
          }
        }
      } catch (e) {
        // AI vision server might be initializing
      }
    };

    fetchVision();
    const timer = setInterval(fetchVision, 2500);
    return () => clearInterval(timer);
  }, [students]);

  const setStatus = (studentId, status) => {
    setStatusMap({ ...statusMap, [studentId]: status });
  };

  const handleApplyVision = () => {
    if (!visionStatus?.present_students) return;
    const detectedRolls = new Set(visionStatus.present_students);
    const updated = { ...statusMap };
    students.forEach((s) => {
      updated[s._id] = detectedRolls.has(s.rollNumber) ? "present" : (updated[s._id] || "absent");
    });
    setStatusMap(updated);
    setMessage(`Applied Live Vision: ${visionStatus.present_students.length} students detected by camera.`);
  };

  const handleSubmit = async () => {
    try {
      const records = students.map((s) => ({
        student: s._id,
        status: statusMap[s._id] || "absent",
      }));
      await api.post("/attendance/manual", { classroom: selectedClassroom, records });
      setMessage("Attendance saved successfully.");
      loadSessions();
    } catch (err) {
      console.error("Error saving attendance:", err);
      setMessage(err.response?.data?.message || "Failed to save attendance.");
    }
  };

  const presentRolls = new Set(visionStatus?.present_students || []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Attendance Tracking</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Automated by Computer Vision Camera or manual teacher verification
          </p>
        </div>

        <Link to="/live-camera">
          <button className="btn btn-blue" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            📹 Open Live AI Camera
          </button>
        </Link>
      </div>

      {/* Live AI Vision Integration Banner */}
      <div style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        color: "#fff",
        padding: "16px 20px",
        borderRadius: 8,
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 14,
        boxShadow: "0 4px 14px rgba(0,0,0,0.12)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>👁️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              Live Computer Vision Attendance
              <span className={`live-badge ${visionStatus?.camera_active ? "active" : ""}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                <span className="live-dot" />
                {visionStatus?.camera_active ? "Active" : "Ready"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Camera automatically recognizes student faces via FaceNet & logs attendance to database.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-green"
            style={{ fontSize: 13 }}
            onClick={handleApplyVision}
          >
            ⚡ Auto-Fill From Camera
          </button>
          <Link to="/live-camera">
            <button className="btn" style={{ backgroundColor: "#3b82f6", fontSize: 13 }}>
              View Live Stream →
            </button>
          </Link>
        </div>
      </div>

      <div className="card">
        <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          Select Classroom
        </label>
        <select value={selectedClassroom} onChange={(e) => setSelectedClassroom(e.target.value)}>
          <option value="">-- Select --</option>
          {classrooms.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        {students.length > 0 && (
          <>
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Name</th>
                  <th>Respective Class</th>
                  <th>Camera AI Status</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Late</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const isCameraPresent = presentRolls.has(s.rollNumber);
                  const currentStatus = statusMap[s._id] || (isCameraPresent ? "present" : "absent");
                  const activeClassObj = classrooms.find((c) => c._id === selectedClassroom);
                  const classNameStr = activeClassObj ? `${activeClassObj.name} (${activeClassObj.section || "A"})` : "Classroom";

                  return (
                    <tr key={s._id} style={{ backgroundColor: isCameraPresent ? "#f0fdf4" : undefined }}>
                      <td><strong>{s.rollNumber}</strong></td>
                      <td>
                        <strong>{s.name}</strong>
                        {isCameraPresent && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            backgroundColor: "#dcfce7",
                            color: "#15803d",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontWeight: 600,
                            border: "1px solid #86efac"
                          }}>
                            ✓ Face Verified
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          backgroundColor: "#eff6ff",
                          color: "#1d4ed8",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid #bfdbfe"
                        }}>
                          {classNameStr}
                        </span>
                      </td>
                      <td>
                        {isCameraPresent ? (
                          <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#16a34a", display: "inline-block" }}></span>
                            Detected in Live Camera
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>
                            Not in camera
                          </span>
                        )}
                      </td>
                      <td>
                        <input
                          type="radio"
                          name={`status-${s._id}`}
                          checked={currentStatus === "present"}
                          onChange={() => setStatus(s._id, "present")}
                        />
                      </td>
                      <td>
                        <input
                          type="radio"
                          name={`status-${s._id}`}
                          checked={currentStatus === "absent"}
                          onChange={() => setStatus(s._id, "absent")}
                        />
                      </td>
                      <td>
                        <input
                          type="radio"
                          name={`status-${s._id}`}
                          checked={currentStatus === "late"}
                          onChange={() => setStatus(s._id, "late")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button className="btn btn-green" onClick={handleSubmit}>
                Save Attendance Record
              </button>
              <button className="btn btn-blue" onClick={loadSessions}>
                🔄 Refresh Sessions
              </button>
            </div>
          </>
        )}
        {message && <p style={{ color: "#27ae60", fontWeight: 600, marginTop: 12 }}>{message}</p>}
      </div>

      {sessions.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Recent Attendance Sessions</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Click any session row to inspect all students with their respective class and attendance status
              </p>
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Total Sessions: {sessions.length}
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Classroom</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Late</th>
                <th>Attendance %</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const presentC = (s.records || []).filter((r) => r.status === "present").length;
                const absentC = (s.records || []).filter((r) => r.status === "absent").length;
                const lateC = (s.records || []).filter((r) => r.status === "late").length;
                const total = s.records?.length || 1;
                const pct = Math.round((presentC / total) * 100);
                const isExpanded = expandedSessionId === s._id;
                const cName = s.classroom ? `${s.classroom.name} (${s.classroom.section || "A"})` : "Classroom";

                return (
                  <>
                    <tr
                      key={s._id}
                      onClick={() => setExpandedSessionId(isExpanded ? null : s._id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isExpanded ? "#f8fafc" : undefined,
                        borderLeft: isExpanded ? "4px solid #3b82f6" : undefined,
                        transition: "background 0.2s ease"
                      }}
                    >
                      <td>
                        <strong>{new Date(s.date).toLocaleString()}</strong>
                      </td>
                      <td>
                        <span style={{
                          backgroundColor: "#f1f5f9",
                          color: "#334155",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {cName}
                        </span>
                      </td>
                      <td className="status-present"><strong>{presentC}</strong></td>
                      <td className="status-absent">{absentC}</td>
                      <td className="status-late">{lateC}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: 12,
                          backgroundColor: pct >= 75 ? "#dcfce7" : "#fee2e2",
                          color: pct >= 75 ? "#166534" : "#991b1b"
                        }}>
                          {pct}%
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn"
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            backgroundColor: isExpanded ? "#3b82f6" : "#e2e8f0",
                            color: isExpanded ? "#fff" : "#1e293b",
                            cursor: "pointer"
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSessionId(isExpanded ? null : s._id);
                          }}
                        >
                          {isExpanded ? "▲ Hide Students" : `👁️ View Students (${s.records?.length || 0})`}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Detail Panel Showing Each Student and Their Status */}
                    {isExpanded && (
                      <tr key={`${s._id}-details`}>
                        <td colSpan={7} style={{ padding: 0, backgroundColor: "#f8fafc" }}>
                          <div style={{
                            padding: "16px 20px",
                            margin: "8px 12px",
                            backgroundColor: "#ffffff",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                              <div>
                                <h4 style={{ margin: 0, color: "#1e293b", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                                  📋 Student Attendance Roster for {cName}
                                  <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                                    • Recorded: {new Date(s.date).toLocaleString()}
                                  </span>
                                </h4>
                              </div>
                              <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                                <span style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: 4, fontWeight: 700 }}>
                                  ✓ {presentC} Present
                                </span>
                                <span style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "3px 8px", borderRadius: 4, fontWeight: 700 }}>
                                  ✗ {absentC} Absent
                                </span>
                                {lateC > 0 && (
                                  <span style={{ backgroundColor: "#fef3c7", color: "#b45309", padding: "3px 8px", borderRadius: 4, fontWeight: 700 }}>
                                    ⏱ {lateC} Late
                                  </span>
                                )}
                              </div>
                            </div>

                            <table style={{ margin: 0, border: "1px solid #e2e8f0" }}>
                              <thead>
                                <tr style={{ backgroundColor: "#f1f5f9" }}>
                                  <th>Roll No</th>
                                  <th>Student Name</th>
                                  <th>Respective Class</th>
                                  <th>Attendance Status</th>
                                  <th>Recorded Method</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(s.records || []).map((rec, rIdx) => {
                                  const stu = rec.student || {};
                                  const isPres = rec.status === "present";
                                  const isLate = rec.status === "late";

                                  return (
                                    <tr key={stu._id || rIdx} style={{ backgroundColor: isPres ? "#f0fdf4" : undefined }}>
                                      <td><strong>{stu.rollNumber || "—"}</strong></td>
                                      <td>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <div style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            backgroundColor: isPres ? "#22c55e" : "#94a3b8",
                                            color: "#fff",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: 700,
                                            fontSize: 12
                                          }}>
                                            {(stu.name || "S").slice(0, 2).toUpperCase()}
                                          </div>
                                          <strong>{stu.name || "Unknown Student"}</strong>
                                        </div>
                                      </td>
                                      <td>
                                        <span style={{
                                          backgroundColor: "#eff6ff",
                                          color: "#1d4ed8",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontSize: 12,
                                          fontWeight: 600,
                                          border: "1px solid #bfdbfe"
                                        }}>
                                          {cName}
                                        </span>
                                      </td>
                                      <td>
                                        {isPres ? (
                                          <span style={{
                                            backgroundColor: "#dcfce7",
                                            color: "#15803d",
                                            padding: "4px 12px",
                                            borderRadius: 20,
                                            fontWeight: 700,
                                            fontSize: 12,
                                            border: "1px solid #86efac",
                                            display: "inline-block"
                                          }}>
                                            ✓ PRESENT
                                          </span>
                                        ) : isLate ? (
                                          <span style={{
                                            backgroundColor: "#fef3c7",
                                            color: "#b45309",
                                            padding: "4px 12px",
                                            borderRadius: 20,
                                            fontWeight: 700,
                                            fontSize: 12,
                                            border: "1px solid #fde68a",
                                            display: "inline-block"
                                          }}>
                                            ⏱ LATE
                                          </span>
                                        ) : (
                                          <span style={{
                                            backgroundColor: "#fee2e2",
                                            color: "#b91c1c",
                                            padding: "4px 12px",
                                            borderRadius: 20,
                                            fontWeight: 700,
                                            fontSize: 12,
                                            border: "1px solid #fca5a5",
                                            display: "inline-block"
                                          }}>
                                            ✗ ABSENT
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <span style={{ fontSize: 12, color: "#64748b" }}>
                                          {isPres ? "AI Face Recognition / Vision" : "Manual / Unverified"}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
