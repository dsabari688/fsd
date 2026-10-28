import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teacher" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const email = form.email ? form.email.trim().toLowerCase() : "";
      const password = form.password || "";
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { name: form.name ? form.name.trim() : "", email, password, role: form.role || "teacher" }
        : { email, password };

      const { data } = await api.post(endpoint, payload);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data));
      onLogin(data);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || (isRegister ? "Registration failed" : "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (email, password) => {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email: email.trim().toLowerCase(), password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data));
      onLogin(data);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-box">
      <div style={{ display: "flex", borderBottom: "1px solid #ddd", marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => { setIsRegister(false); setError(""); }}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            background: !isRegister ? "#3498db" : "#f4f6f8",
            color: !isRegister ? "#fff" : "#555",
            fontWeight: "bold",
            cursor: "pointer",
            borderRadius: "4px 0 0 0",
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setIsRegister(true); setError(""); }}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            background: isRegister ? "#3498db" : "#f4f6f8",
            color: isRegister ? "#fff" : "#555",
            fontWeight: "bold",
            cursor: "pointer",
            borderRadius: "0 4px 0 0",
          }}
        >
          Register
        </button>
      </div>

      <h2>{isRegister ? "Create Account" : "Sign In to Portal"}</h2>
      {error && <p style={{ color: "#e74c3c", background: "#fde8e8", padding: "8px 12px", borderRadius: 4 }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        {isRegister && (
          <div>
            <label style={{ fontSize: 13, fontWeight: "bold" }}>Full Name</label>
            <input name="name" type="text" placeholder="e.g. John Doe" value={form.name} onChange={handleChange} required />
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, fontWeight: "bold" }}>Email Address</label>
          <input name="email" type="email" placeholder="name@classroom.com" value={form.email} onChange={handleChange} required />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: "bold" }}>Password</label>
          <input name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleChange} required />
        </div>

        {isRegister && (
          <div>
            <label style={{ fontSize: 13, fontWeight: "bold" }}>Role</label>
            <select name="role" value={form.role} onChange={handleChange}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}

        <button className="btn btn-blue" type="submit" disabled={loading} style={{ width: "100%", marginTop: 8 }}>
          {loading ? "Please wait..." : isRegister ? "Register" : "Login"}
        </button>
      </form>

      {!isRegister && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed #ccc" }}>
          <p style={{ fontSize: 12, color: "#666", marginBottom: 8, textAlign: "center" }}>Quick Demo Access:</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-green"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => handleDemoLogin("admin@classroom.com", "admin123")}
            >
              Demo Admin
            </button>
            <button
              type="button"
              className="btn btn-blue"
              style={{ flex: 1, fontSize: 12, backgroundColor: "#8e44ad" }}
              onClick={() => handleDemoLogin("teacher@classroom.com", "teacher123")}
            >
              Demo Teacher
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
