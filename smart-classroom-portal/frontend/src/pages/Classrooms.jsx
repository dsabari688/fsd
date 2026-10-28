import { useEffect, useState } from "react";
import api from "../api/api";

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [form, setForm] = useState({ name: "", section: "", subject: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/classrooms");
      setClassrooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading classrooms:", err);
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to load classrooms. Please make sure the backend server is running.";
      setError(msg);
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
    if (!form.name.trim()) {
      setError("Please enter a classroom name.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name.trim(),
        section: form.section.trim(),
        subject: form.subject.trim(),
      };

      const { data: newClassroom } = await api.post("/classrooms", payload);

      // Reset form
      setForm({ name: "", section: "", subject: "" });
      setSuccess(`Classroom "${newClassroom.name}" created successfully!`);

      // Optimistically update list and reload
      setClassrooms((prev) => [newClassroom, ...prev.filter((c) => c._id !== newClassroom._id)]);
      await load();
    } catch (err) {
      console.error("Error adding classroom:", err);
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to create classroom. Please check your backend connection.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name || "this classroom"}"?`)) {
      return;
    }

    setError("");
    setSuccess("");
    try {
      await api.delete(`/classrooms/${id}`);
      setSuccess(`Classroom "${name || ""}" deleted successfully.`);
      setClassrooms((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      console.error("Error deleting classroom:", err);
      const msg = err.response?.data?.message || "Failed to delete classroom.";
      setError(msg);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Classrooms ({classrooms.length})</h2>
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
        <h3 style={{ marginTop: 0 }}>Add Classroom</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Classroom Name <span style={{ color: "#e74c3c" }}>*</span>
            </label>
            <input
              name="name"
              placeholder="e.g. AI & Data Science - 3rd Year"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Section
            </label>
            <input
              name="section"
              placeholder="e.g. Section A"
              value={form.section}
              onChange={handleChange}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>
              Subject
            </label>
            <input
              name="subject"
              placeholder="e.g. Database Management Systems"
              value={form.subject}
              onChange={handleChange}
            />
          </div>

          <button
            className="btn btn-blue"
            type="submit"
            disabled={submitting}
            style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Adding Classroom..." : "Add Classroom"}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Section</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Students</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && classrooms.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "#666" }}>
                  Loading classrooms...
                </td>
              </tr>
            ) : classrooms.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                  No classrooms found. Use the form above to add your first classroom.
                </td>
              </tr>
            ) : (
              classrooms.map((c) => (
                <tr key={c._id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.section || "-"}</td>
                  <td>{c.subject || "-"}</td>
                  <td>{c.teacher?.name || "Assigned Teacher"}</td>
                  <td>
                    <span
                      style={{
                        background: "#eef2f7",
                        padding: "3px 8px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {c.students?.length || 0} enrolled
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-red"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => handleDelete(c._id, c.name)}
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
