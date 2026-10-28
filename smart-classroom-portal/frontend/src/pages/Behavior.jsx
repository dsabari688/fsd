import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

const BEHAVIORS = ["studying", "speaking", "sleeping", "phone_use", "raising_hand", "distracted"];
const VISION_BASE = "http://localhost:5001/api/vision";

export default function Behavior() {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [students, setStudents] = useState([]);
  const [behaviorMap, setBehaviorMap] = useState({});
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
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
      setSummary(null);
      setLogs([]);
      return;
    }
    const classroom = classrooms.find((c) => c._id === selectedClassroom);
    setStudents(classroom?.students || []);
    setBehaviorMap({});
    loadSummary();
    loadLogs();
  }, [selectedClassroom, classrooms]);

  const loadSummary = async () => {
    if (!selectedClassroom) return;
    try {
      const { data } = await api.get(`/behavior/summary/${selectedClassroom}`);
      setSummary(data);
    } catch (err) {
      console.error("Error loading behavior summary:", err);
    }
  };

  const loadLogs = async () => {
    if (!selectedClassroom) return;
    try {
      const { data } = await api.get(`/behavior?classroom=${selectedClassroom}`);
      setLogs(data);
      if (data.length > 0) {
        setExpandedLogId((prev) => prev || data[0]._id);
      }
    } catch (err) {
      console.error("Error loading behavior logs:", err);
    }
  };

  // Poll live vision behavior updates
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
          // If latest_behaviors available, populate behaviorMap
          if (data.latest_behaviors) {
            setBehaviorMap((prev) => {
              const updated = { ...prev };
              students.forEach((s) => {
                const bInfo = data.latest_behaviors[s.rollNumber];
                if (bInfo && !prev[s._id]) {
                  updated[s._id] = bInfo.behavior;
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

  const setBehavior = (studentId, behavior) => {
    setBehaviorMap({ ...behaviorMap, [studentId]: behavior });
  };

  const handleApplyVisionBehaviors = () => {
    if (!visionStatus?.latest_behaviors) return;
    const updated = { ...behaviorMap };
    students.forEach((s) => {
      const bInfo = visionStatus.latest_behaviors[s.rollNumber];
      if (bInfo) {
        updated[s._id] = bInfo.behavior;
      }
    });
    setBehaviorMap(updated);
    setMessage(`Applied live camera behaviors for recognized students.`);
  };

  const handleSubmit = async () => {
    try {
      const events = students.map((s) => ({
        student: s._id,
        behavior: behaviorMap[s._id] || "attentive",
      }));
      await api.post("/behavior/manual", { classroom: selectedClassroom, events });
      setMessage("Behavior snapshot saved to database successfully.");
      loadSummary();
    } catch (err) {
      console.error("Error saving behavior log:", err);
      setMessage(err.response?.data?.message || "Failed to save behavior log.");
    }
  };

  const latestBehaviors = visionStatus?.latest_behaviors || {};

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Behavior Tracking & Analytics</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Automated Computer Vision Detection via YOLOv8 & Facial Action Analysis
          </p>
        </div>

        <Link to="/live-camera">
          <button className="btn btn-blue" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            📹 Open Live AI Camera
          </button>
        </Link>
      </div>

      {/* Live AI Vision Banner */}
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
          <span style={{ fontSize: 28 }}>🤖</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              Automated AI Behavior Monitoring
              <span className={`live-badge ${visionStatus?.camera_active ? "active" : ""}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                <span className="live-dot" />
                {visionStatus?.camera_active ? "Active" : "Ready"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Detects Studying, Sleeping, Speaking, Phone Use, Raising Hand & Distraction in real time.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-green"
            style={{ fontSize: 13 }}
            onClick={handleApplyVisionBehaviors}
          >
            ⚡ Auto-Fill From Camera
          </button>
          <Link to="/live-camera">
            <button className="btn" style={{ backgroundColor: "#3b82f6", fontSize: 13 }}>
              View Live HUD →
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
                  <th>Camera Live Detected</th>
                  {BEHAVIORS.map((b) => (
                    <th key={b} style={{ textTransform: "capitalize" }}>{b.replace("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const bInfo = latestBehaviors[s.rollNumber];
                  const liveDetected = bInfo?.behavior;
                  const currentSelected = behaviorMap[s._id] || liveDetected || "";
                  const activeClassObj = classrooms.find((c) => c._id === selectedClassroom);
                  const classNameStr = activeClassObj ? `${activeClassObj.name} (${activeClassObj.section || "A"})` : "Classroom";

                  return (
                    <tr key={s._id} style={{ backgroundColor: liveDetected ? "#f8fafc" : undefined }}>
                      <td><strong>{s.rollNumber}</strong></td>
                      <td><strong>{s.name}</strong></td>
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
                        {liveDetected ? (
                          <span className={`behavior-pill behavior-${liveDetected.toLowerCase()}`}>
                            {liveDetected.replace("_", " ")}
                            {bInfo.conf ? ` (${Math.round(bInfo.conf * 100)}%)` : ""}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>Awaiting face</span>
                        )}
                      </td>
                      {BEHAVIORS.map((b) => (
                        <td key={b}>
                          <input
                            type="radio"
                            name={`behavior-${s._id}`}
                            checked={currentSelected === b}
                            onChange={() => setBehavior(s._id, b)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button className="btn btn-green" onClick={handleSubmit}>
                Save Behavior Snapshot
              </button>
              <button className="btn btn-blue" onClick={() => { loadSummary(); loadLogs(); }}>
                🔄 Refresh Analytics
              </button>
            </div>
          </>
        )}
        {message && <p style={{ color: "#27ae60", fontWeight: 600, marginTop: 12 }}>{message}</p>}
      </div>

      {/* Selected Student Behavior Modal / Spotlight Card */}
      {selectedStudentDetail && (
        <div className="card" style={{ borderLeft: "4px solid #3b82f6", backgroundColor: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              👤 Student Profile & Behavior Report: {selectedStudentDetail.name}
              <span style={{
                fontSize: 12,
                backgroundColor: "#dcfce7",
                color: "#15803d",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #86efac"
              }}>
                ✓ Present in Class
              </span>
            </h3>
            <button
              className="btn"
              style={{ fontSize: 12, padding: "2px 8px", background: "#e2e8f0" }}
              onClick={() => setSelectedStudentDetail(null)}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div style={{ background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Roll Number</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>{selectedStudentDetail.rollNumber}</div>
            </div>
            <div style={{ background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Respective Classroom</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#2563eb" }}>{selectedStudentDetail.className}</div>
            </div>
            <div style={{ background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Current Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#16a34a" }}>Active & Attentive</div>
            </div>
          </div>

          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#475569" }}>Historical Behavior Breakdown for this Student:</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 14px", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Studying / Attentive</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {(selectedStudentDetail.counts?.studying || 0) + (selectedStudentDetail.counts?.attentive || 0)}
              </div>
            </div>
            <div style={{ background: "#ffedd5", color: "#9a3412", padding: "10px 14px", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Speaking / Talking</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {(selectedStudentDetail.counts?.speaking || 0) + (selectedStudentDetail.counts?.talking || 0)}
              </div>
            </div>
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Sleeping</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {selectedStudentDetail.counts?.sleeping || 0}
              </div>
            </div>
            <div style={{ background: "#f3e8ff", color: "#6b21a8", padding: "10px 14px", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Phone Use</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {selectedStudentDetail.counts?.phone_use || 0}
              </div>
            </div>
            <div style={{ background: "#e0f2fe", color: "#075985", padding: "10px 14px", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Raising Hand</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {selectedStudentDetail.counts?.raising_hand || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Behavior Sessions Table with Expandable Student Details */}
      {logs.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Recent Behavior Sessions & Logs</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Click any session row to inspect all students with their respective class and observed behaviors
              </p>
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Total Sessions: {logs.length}
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Classroom</th>
                <th>Observed Students</th>
                <th>Primary Behaviors</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isExpanded = expandedLogId === log._id;
                const cName = log.classroom ? `${log.classroom.name} (${log.classroom.section || "A"})` : "Classroom";
                const totalObserved = (log.events || []).length;
                const behaviorSet = Array.from(new Set((log.events || []).map((e) => e.behavior || "attentive")));

                return (
                  <>
                    <tr
                      key={log._id}
                      onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isExpanded ? "#f8fafc" : undefined,
                        borderLeft: isExpanded ? "4px solid #8b5cf6" : undefined,
                        transition: "background 0.2s ease"
                      }}
                    >
                      <td><strong>{new Date(log.capturedAt).toLocaleString()}</strong></td>
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
                      <td><strong>{totalObserved} students</strong></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {behaviorSet.map((b) => (
                            <span key={b} className={`behavior-pill behavior-${b.toLowerCase()}`} style={{ fontSize: 11, padding: "2px 6px" }}>
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn"
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            backgroundColor: isExpanded ? "#8b5cf6" : "#e2e8f0",
                            color: isExpanded ? "#fff" : "#1e293b",
                            cursor: "pointer"
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedLogId(isExpanded ? null : log._id);
                          }}
                        >
                          {isExpanded ? "▲ Hide Students" : `👁️ View Students (${totalObserved})`}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Roster of Students in this Behavior Session */}
                    {isExpanded && (
                      <tr key={`${log._id}-details`}>
                        <td colSpan={5} style={{ padding: 0, backgroundColor: "#f8fafc" }}>
                          <div style={{
                            padding: "16px 20px",
                            margin: "8px 12px",
                            backgroundColor: "#ffffff",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                              <h4 style={{ margin: 0, color: "#1e293b", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                                📋 Behavior Details for {cName}
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                                  • Captured: {new Date(log.capturedAt).toLocaleString()}
                                </span>
                              </h4>
                            </div>

                            <table style={{ margin: 0, border: "1px solid #e2e8f0" }}>
                              <thead>
                                <tr style={{ backgroundColor: "#f1f5f9" }}>
                                  <th>Roll No</th>
                                  <th>Student Name</th>
                                  <th>Respective Class</th>
                                  <th>Observed Behavior</th>
                                  <th>Class Presence</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(log.events || []).map((ev, eIdx) => {
                                  const stu = ev.student || {};
                                  const b = ev.behavior || "attentive";

                                  return (
                                    <tr key={stu._id || eIdx}>
                                      <td><strong>{stu.rollNumber || "—"}</strong></td>
                                      <td>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <div style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            backgroundColor: "#8b5cf6",
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
                                        <span className={`behavior-pill behavior-${b.toLowerCase()}`} style={{ fontSize: 12, padding: "4px 10px" }}>
                                          {b}
                                        </span>
                                      </td>
                                      <td>
                                        <span style={{
                                          backgroundColor: "#dcfce7",
                                          color: "#15803d",
                                          padding: "3px 10px",
                                          borderRadius: 20,
                                          fontWeight: 700,
                                          fontSize: 11,
                                          border: "1px solid #86efac",
                                          display: "inline-block"
                                        }}>
                                          ✓ PRESENT
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

      {/* Aggregate Behavior Summary Table */}
      {summary && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Behavior Summary — {summary.classroom}</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Click any student row to view their individual attendance and behavioral profile
              </p>
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Total Logs Recorded: {summary.totalLogs}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Respective Class</th>
                <th>Studying / Attentive</th>
                <th>Speaking / Talking</th>
                <th>Sleeping</th>
                <th>Phone Use</th>
                <th>Raising Hand</th>
                <th>Distracted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.summary.map((row) => (
                <tr
                  key={row.student._id}
                  onClick={() => setSelectedStudentDetail({
                    name: row.student.name,
                    rollNumber: row.student.rollNumber,
                    className: summary.classroom,
                    counts: row.counts
                  })}
                  style={{ cursor: "pointer", transition: "background 0.2s" }}
                >
                  <td>
                    <strong>{row.student.name}</strong> ({row.student.rollNumber})
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
                      {summary.classroom}
                    </span>
                  </td>
                  <td className="status-present">
                    {(row.counts.studying || 0) + (row.counts.attentive || 0)}
                  </td>
                  <td style={{ color: "#e67e22", fontWeight: 600 }}>
                    {(row.counts.speaking || 0) + (row.counts.talking || 0)}
                  </td>
                  <td className="status-absent">
                    {row.counts.sleeping || 0}
                  </td>
                  <td style={{ color: "#8e44ad", fontWeight: 600 }}>
                    {row.counts.phone_use || 0}
                  </td>
                  <td style={{ color: "#2980b9", fontWeight: 600 }}>
                    {row.counts.raising_hand || 0}
                  </td>
                  <td className="status-late">
                    {row.counts.distracted || 0}
                  </td>
                  <td>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: "2px 8px", backgroundColor: "#3b82f6" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudentDetail({
                          name: row.student.name,
                          rollNumber: row.student.rollNumber,
                          className: summary.classroom,
                          counts: row.counts
                        });
                      }}
                    >
                      👁️ View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
