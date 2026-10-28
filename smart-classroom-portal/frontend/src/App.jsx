import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Classrooms from "./pages/Classrooms";
import Students from "./pages/Students";
import Attendance from "./pages/Attendance";
import Behavior from "./pages/Behavior";
import LiveCamera from "./pages/LiveCamera";

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (saved && token) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        setUser(null);
      }
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      setUser(null);
    }

    const handleAuthLogout = () => {
      setUser(null);
    };
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  const handleLogin = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Navbar title="Smart Classroom & Attendance Analytics Portal" user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live-camera" element={<LiveCamera />} />
          <Route path="/classrooms" element={<Classrooms />} />
          <Route path="/students" element={<Students />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/behavior" element={<Behavior />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}
