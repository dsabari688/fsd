import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const VISION_BASE = "http://localhost:5001/api/vision";

export default function LiveCamera() {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [visionStatus, setVisionStatus] = useState(null);
  const [students, setStudents] = useState([]);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedStudentForEnroll, setSelectedStudentForEnroll] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());

  // Load classrooms on mount
  useEffect(() => {
    api.get("/classrooms").then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      setClassrooms(list);
      if (list.length > 0) {
        setSelectedClassroom(list[0]._id);
      } else {
        setSelectedClassroom("");
      }
    }).catch((err) => console.error("Error loading classrooms:", err));
  }, []);

  // When selected classroom changes, inform vision server and load students
  useEffect(() => {
    if (!selectedClassroom) return;
    const classroomObj = classrooms.find((c) => c._id === selectedClassroom);
    setStudents(classroomObj?.students || []);

    // Inform AI Vision engine about active classroom
    api.post("/vision/set_classroom", {
      classroom_id: selectedClassroom,
      name: classroomObj?.name || "",
    }).catch(() => {
      // Fallback direct to port 5001
      fetch(`${VISION_BASE}/set_classroom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroom_id: selectedClassroom, name: classroomObj?.name }),
      }).catch((e) => console.warn("Vision server direct set error:", e));
    });
  }, [selectedClassroom, classrooms]);

  // Real-Time Polling of AI Vision status
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        let data = null;
        try {
          const res = await api.get("/vision/status");
          data = res.data;
        } catch {
          // Direct fallback to 5001
          const raw = await fetch(`${VISION_BASE}/status`);
          data = await raw.json();
        }

        if (isMounted && data) {
          setVisionStatus(data);
          setIsCameraActive(data.camera_active);
          setStreamError(false);
        }
      } catch (err) {
        if (isMounted) {
          setStreamError(true);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedClassroom]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const toggleCamera = async () => {
    const nextState = !isCameraActive;
    try {
      const endpoint = nextState ? "/vision/start" : "/vision/stop";
      let msg = nextState ? "Camera started" : "Camera paused";
      try {
        const { data } = await api.post(endpoint);
        if (data?.message) msg = data.message;
      } catch {
        try {
          const raw = await fetch(`${VISION_BASE}${nextState ? "/start" : "/stop"}`, { method: "POST" });
          const data = await raw.json();
          if (data?.message) msg = data.message;
        } catch {
          // Local toggle fallback
        }
      }
      setIsCameraActive(nextState);
      setStreamKey(Date.now());
      showToast(msg);
    } catch {
      setIsCameraActive(nextState);
      showToast(nextState ? "Camera started" : "Camera paused");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      let res;
      try {
        res = await api.post("/vision/sync_now");
      } catch {
        const raw = await fetch(`${VISION_BASE}/sync_now`, { method: "POST" });
        res = { data: await raw.json() };
      }
      showToast(res.data?.message || "Synced attendance and behavior to database!");
    } catch (err) {
      showToast("Error syncing to backend database");
    } finally {
      setSyncing(false);
    }
  };

  const handleEnrollFace = async () => {
    if (!selectedStudentForEnroll) {
      alert("Please select a student to enroll.");
      return;
    }
    const student = students.find((s) => s.rollNumber === selectedStudentForEnroll);
    if (!student) return;

    setEnrolling(true);
    try {
      let res;
      const payload = { rollNumber: student.rollNumber, name: student.name };
      try {
        res = await api.post("/vision/enroll", payload);
      } catch {
        const raw = await fetch(`${VISION_BASE}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        res = { data: await raw.json() };
      }

      if (res.data?.success) {
        showToast(`Face enrolled for ${student.name}! Marked PRESENT.`);
        setShowEnrollModal(false);
      } else {
        showToast(res.data?.message || "Enrollment failed. Face the camera directly.");
      }
    } catch (err) {
      showToast("Failed to enroll face. Check camera view.");
    } finally {
      setEnrolling(false);
    }
  };

  // Compute live classroom metrics
  const selectedClassroomObj = classrooms.find((c) => c._id === selectedClassroom);
  const presentRolls = new Set(visionStatus?.present_students || []);
  const latestBehaviors = visionStatus?.latest_behaviors || {};

  const presentCount = students.filter((s) => presentRolls.has(s.rollNumber)).length;
  const totalCount = students.length || 1;
  const attendancePercent = Math.round((presentCount / totalCount) * 100);

  // Behavior metrics
  const behaviorCounts = { studying: 0, speaking: 0, sleeping: 0, phone_use: 0, raising_hand: 0, distracted: 0 };
  Object.values(latestBehaviors).forEach((bInfo) => {
    const b = bInfo?.behavior?.toLowerCase() || "unknown";
    if (b in behaviorCounts) behaviorCounts[b]++;
    else if (b === "attentive") behaviorCounts.studying++;
    else if (b === "talking") behaviorCounts.speaking++;
  });

  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Live Computer Vision Camera</h2>
            <span
              className={`live-badge ${isCameraActive && visionStatus?.connected ? "active" : ""}`}
              style={visionStatus?.connected === false ? { backgroundColor: "#fef3c7", color: "#b45309", borderColor: "#fde68a" } : {}}
            >
              <span className="live-dot" style={visionStatus?.connected === false ? { backgroundColor: "#f59e0b" } : {}} />
              {visionStatus?.connected
                ? (isCameraActive ? "LIVE AI ACTIVE" : "CAMERA PAUSED")
                : "AI ENGINE INITIALIZING"}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Real-time Face Recognition Attendance + YOLOv8 Behavioral Analytics Pipeline
          </p>
        </div>

        {/* Global Controls */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {visionStatus?.connected === false ? (
            <button
              className="btn btn-green"
              onClick={toggleCamera}
              title="Launch AI Vision Server"
            >
              ⚡ Launch AI Engine
            </button>
          ) : (
            <button
              className={`btn ${isCameraActive ? "btn-red" : "btn-green"}`}
              onClick={toggleCamera}
            >
              {isCameraActive ? "⏸ Pause Camera" : "▶ Start Camera"}
            </button>
          )}

          <button
            className="btn btn-blue"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? "Saving..." : "💾 Sync DB Now"}
          </button>

          <button
            className="btn"
            style={{ backgroundColor: "#8e44ad" }}
            onClick={() => setShowEnrollModal(true)}
          >
            📸 Enroll Face
          </button>
        </div>
      </div>

      {toastMessage && (
        <div style={{
          backgroundColor: "#27ae60",
          color: "white",
          padding: "10px 16px",
          borderRadius: 6,
          marginBottom: 16,
          fontWeight: 600,
          boxShadow: "0 4px 12px rgba(39, 174, 96, 0.25)"
        }}>
          ✓ {toastMessage}
        </div>
      )}

      {/* Classroom Selector Card */}
      <div className="card" style={{ padding: "12px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
            <label style={{ fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>
              Active Classroom:
            </label>
            <select
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
              style={{ maxWidth: 360, margin: 0 }}
            >
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.section || "General"})
                </option>
              ))}
            </select>
          </div>

          {/* Quick HUD Metrics */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Present in Class:</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>
                {presentCount} / {students.length} ({attendancePercent}%)
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>AI Vision FPS:</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0284c7" }}>
                {visionStatus?.fps || 0} FPS
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Faces in Frame:</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#9333ea" }}>
                {visionStatus?.in_camera_count || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Video Stream + Live Student Presence */}
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 20, alignItems: "start" }}>
        
        {/* Left Column: Live Camera Video Stream */}
        <div>
          <div className="camera-monitor-container">
            {/* Camera Header Banner */}
            <div style={{
              padding: "10px 16px",
              background: "#111827",
              color: "#e2e8f0",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #1f2937"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#22c55e" }}>●</span>
                <span>Camera Feed: FaceNet + YOLOv8 HUD Stream</span>
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Port 5001 • MJPEG High Definition</span>
            </div>

            {/* Video Stream Container */}
            <div className="camera-stream-wrapper">
              {isCameraActive ? (
                <img
                  key={streamKey}
                  src={`${VISION_BASE}/stream?t=${streamKey}`}
                  alt="Live AI Camera Stream"
                  className="camera-stream-img"
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div style={{ color: "#94a3b8", textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#cbd5e1" }}>Camera is currently paused</div>
                  <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 16px" }}>
                    Click "Start Camera" above to resume real-time vision detection.
                  </p>
                  <button className="btn btn-green" onClick={toggleCamera}>
                    ▶ Start AI Camera
                  </button>
                </div>
              )}

              {streamError && isCameraActive && (
                <div style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: "rgba(15, 20, 28, 0.92)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  padding: 24,
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#f87171" }}>
                    {visionStatus?.connected === false
                      ? "AI Vision Engine Offline or Starting Up"
                      : "Connecting to AI Camera Stream..."}
                  </div>
                  <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 380, margin: "8px 0 16px" }}>
                    {visionStatus?.connected === false
                      ? "The Python AI Vision Engine (FaceNet + YOLOv8) is not running on port 5001. Click 'Launch AI Engine' below to start it."
                      : "Camera device 0 is initializing and computing neural inference models."}
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    {visionStatus?.connected === false && (
                      <button className="btn btn-green" onClick={toggleCamera}>
                        ⚡ Launch AI Engine
                      </button>
                    )}
                    <button className="btn btn-blue" onClick={() => setStreamKey(Date.now())}>
                      🔄 Retry Stream Connection
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stream HUD Controls & Live Detections bar */}
            <div className="camera-controls-bar">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Active in View:</span>
                {visionStatus?.active_detections?.length > 0 ? (
                  visionStatus.active_detections.map((d, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 12,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: "#1e293b",
                        color: "#38bdf8",
                        fontWeight: 600,
                        border: "1px solid #334155"
                      }}
                    >
                      {d.name || "Student"} ({d.behavior})
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
                    No student currently inside camera frame
                  </span>
                )}
              </div>

              <span style={{ fontSize: 11, color: "#64748b" }}>
                Auto-syncs every 10s • Sync count: {visionStatus?.sync_count || 0}
              </span>
            </div>
          </div>

          {/* Behavior Breakdown Stat Cards */}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 10px", color: "#334155", fontSize: 14 }}>Real-Time Behavior Breakdown</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div className="card" style={{ margin: 0, padding: 12, borderLeft: "4px solid #16a34a" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Studying / Attentive</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{behaviorCounts.studying}</div>
              </div>
              <div className="card" style={{ margin: 0, padding: 12, borderLeft: "4px solid #ea580c" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Speaking / Talking</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#ea580c" }}>{behaviorCounts.speaking}</div>
              </div>
              <div className="card" style={{ margin: 0, padding: 12, borderLeft: "4px solid #dc2626" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Sleeping / Drowsy</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{behaviorCounts.sleeping}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Enrolled Students Presence Cards */}
        <div>
          <div className="card" style={{ margin: 0, minHeight: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>
                Classroom Students ({students.length})
              </h3>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Live Status from Computer Vision
              </span>
            </div>

            {/* Attendance Progress Meter */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>
                <span style={{ color: "#16a34a" }}>{presentCount} Present</span>
                <span style={{ color: "#dc2626" }}>{students.length - presentCount} Absent</span>
              </div>
              <div style={{ width: "100%", height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${attendancePercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #22c55e, #16a34a)",
                    transition: "width 0.4s ease"
                  }}
                />
              </div>
            </div>

            {/* Student Presence Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 540, overflowY: "auto", paddingRight: 4 }}>
              {students.map((s) => {
                const isPresent = presentRolls.has(s.rollNumber);
                const bInfo = latestBehaviors[s.rollNumber];
                const behaviorName = bInfo?.behavior || (isPresent ? "attentive" : "unknown");

                return (
                  <div
                    key={s._id || s.rollNumber}
                    className={`student-vision-card ${isPresent ? "present" : "absent"}`}
                  >
                    <div className="student-card-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div className="student-avatar">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            Roll: <strong>{s.rollNumber}</strong> • Class: <span style={{ color: "#2563eb", fontWeight: 600 }}>{selectedClassroomObj ? `${selectedClassroomObj.name} (${selectedClassroomObj.section || "A"})` : "Class"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Presence Status Pill */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 9px",
                          borderRadius: 20,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          backgroundColor: isPresent ? "#dcfce7" : "#f1f5f9",
                          color: isPresent ? "#15803d" : "#64748b",
                          border: isPresent ? "1px solid #86efac" : "1px solid #cbd5e1"
                        }}
                      >
                        {isPresent ? "✓ PRESENT" : "ABSENT"}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>Behavior:</span>
                        <span className={`behavior-pill behavior-${behaviorName.toLowerCase()}`}>
                          {behaviorName}
                        </span>
                      </div>

                      <button
                        style={{
                          background: "none",
                          border: "none",
                          color: "#3b82f6",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: "2px 6px"
                        }}
                        onClick={() => {
                          setSelectedStudentForEnroll(s.rollNumber);
                          setShowEnrollModal(true);
                        }}
                      >
                        📸 Enroll Face
                      </button>
                    </div>
                  </div>
                );
              })}

              {students.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                  No students registered in this classroom yet.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Face Enrollment Modal */}
      {showEnrollModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 style={{ margin: "0 0 12px", color: "#1e293b" }}>
              📸 Enroll Student Face from Camera
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
              Look directly into the camera so FaceNet can extract facial features and link them to the selected student.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Select Student:
              </label>
              <select
                value={selectedStudentForEnroll}
                onChange={(e) => setSelectedStudentForEnroll(e.target.value)}
              >
                <option value="">-- Choose Student --</option>
                {students.map((s) => (
                  <option key={s._id || s.rollNumber} value={s.rollNumber}>
                    {s.name} ({s.rollNumber})
                  </option>
                ))}
              </select>
            </div>

            <div style={{
              background: "#f8fafc",
              padding: 12,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              marginBottom: 18,
              fontSize: 12,
              color: "#475569"
            }}>
              💡 <strong>Tip:</strong> Position your face centered in the camera view. When you click "Capture & Enroll", your face will be immediately recognized and marked <strong>PRESENT</strong> in all sessions!
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                className="btn"
                style={{ backgroundColor: "#94a3b8" }}
                onClick={() => setShowEnrollModal(false)}
                disabled={enrolling}
              >
                Cancel
              </button>
              <button
                className="btn btn-green"
                onClick={handleEnrollFace}
                disabled={enrolling || !selectedStudentForEnroll}
              >
                {enrolling ? "Extracting Face..." : "Capture & Enroll Face"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
