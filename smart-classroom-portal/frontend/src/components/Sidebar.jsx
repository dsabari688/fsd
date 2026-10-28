import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2>Smart Classroom</h2>
      <NavLink to="/" end>Dashboard</NavLink>
      <NavLink to="/live-camera" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        Live AI Vision
      </NavLink>
      <NavLink to="/classrooms">Classrooms</NavLink>
      <NavLink to="/students">Students</NavLink>
      <NavLink to="/attendance">Attendance</NavLink>
      <NavLink to="/behavior">Behavior</NavLink>
    </div>
  );
}
