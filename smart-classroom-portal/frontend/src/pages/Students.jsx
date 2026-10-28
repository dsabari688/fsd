import { useEffect, useState } from "react";
import api from "../api/api";

export default function Students() {
  const [students, setStudents] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [form, setForm] = useState({ rollNumber: "", name: "", email: "", classroom: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [studentsRes, classroomsRes] = await Promise.all([
        api.get("/students"),
        api.get("/classrooms"),
      ]);
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
      setClassrooms(Array.isArray(classroomsRes.data) ? classroomsRes.data : []);
    } catch (err) {
      console.error("Error loading students:", err);
      setError(err.response?.data?.message || err.message || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.rollNumber.trim() || !form.name.trim()) {
      setError("Roll Number and Name are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        rollNumber: form.rollNumber.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        classroom: form.classroom || undefined,
      };

      const { data: newStudent } = await api.post("/students", payload);
      setForm({ rollNumber: "", name: "", email: "", classroom: "" });
      setSuccess(`Student "${newStudent.name}" (${newStudent.rollNumber}) added successfully!`);
      await load();
    } catch (err) {
      console.error("Error adding student:", err);
      const msg = err.response?.data?.message || err.message || "Failed to add student.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete student "${name || "this student"}"?`)) {
      return;
    }

    setError("");
    setSuccess("");
    try {
      await api.delete(`/students/${id}`);
      setSuccess(`Student "${name || ""}" deleted successfully.`);
      setStudents((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      console.error("Error deleting student:", err);
      setError(err.response?.data?.message || "Failed to delete student.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Students ({students.length})</h2>
        <button
          className="btn"
          style={{ background: "#95a5a6", fontSize: 13 }}
          onClick={load}
          disabled={loading}
          type="button"
        >
          {loading ? "Refreshing..." : "↻ Refresh List"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#fde8e8",
            color: "#c0392b",
            border: "1px solid #f5c6cb",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold", color: "#c0392b" }}
          >
            ✕
          </button>
        </div>
      )}

      {success && (
        <div
          style={{
            background: "#e8f8f0",
            color: "#27ae60",
            border: "1px solid #c3e6cb",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✅ {success}</span>
          <button
            type="button"
            onClick={() => setSuccess("")}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold", color: "#27ae60" }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add Student</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Roll Number <span style={{ color: "#e74c3c" }}>*</span>
            </label>
            <input
              name="rollNumber"
              placeholder="e.g. CS-201"
              value={form.rollNumber}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Full Name <span style={{ color: "#e74c3c" }}>*</span>
            </label>
            <input
              name="name"
              placeholder="e.g. Jane Doe"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Email
            </label>
            <input
              name="email"
              type="email"
              placeholder="e.g. jane@example.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Assigned Classroom
            </label>
            <select name="classroom" value={form.classroom} onChange={handleChange}>
              <option value="">-- Select Classroom (Optional) --</option>
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.section ? `(${c.section})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-blue"
            type="submit"
            disabled={submitting}
            style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Adding Student..." : "Add Student"}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Name</th>
              <th>Email</th>
              <th>Classroom</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && students.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "24px", color: "#666" }}>
                  Loading students...
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                  No students found. Use the form above to add a student.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s._id}>
                  <td><strong>{s.rollNumber}</strong></td>
                  <td>{s.name}</td>
                  <td>{s.email || "-"}</td>
                  <td>{s.classroom?.name || "-"}</td>
                  <td>
                    <button
                      className="btn btn-red"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => handleDelete(s._id, s.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
