import { useEffect, useState } from "react";
import api from "../api/api";

export default function Navbar({ title, user, onLogout }) {
  const [dbStatus, setDbStatus] = useState({ connected: null, mode: "", port: null });

  useEffect(() => {
    let isMounted = true;
    const checkDb = async () => {
      try {
        const { data } = await api.get("/db-status");
        if (isMounted) {
          setDbStatus(data);
        }
      } catch (err) {
        if (isMounted) {
          setDbStatus({ connected: false, error: "Backend / Database offline" });
        }
      }
    };

    checkDb();
    const timer = setInterval(checkDb, 8000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      className="navbar"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <strong>{title}</strong>
        {dbStatus.connected !== null && (
          <div
            title={
              dbStatus.connected
                ? `Database Connected! Mode: ${dbStatus.mode} | Port: ${dbStatus.port || 27017} | Location: ${dbStatus.storagePath || "Disk"}`
                : "Database disconnected! Check backend server."
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 20,
              backgroundColor: dbStatus.connected ? "#dcfce7" : "#fee2e2",
              color: dbStatus.connected ? "#15803d" : "#b91c1c",
              border: `1px solid ${dbStatus.connected ? "#86efac" : "#fca5a5"}`,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: dbStatus.connected ? "#22c55e" : "#ef4444",
                boxShadow: dbStatus.connected ? "0 0 6px #22c55e" : "none",
                display: "inline-block",
              }}
            />
            {dbStatus.connected
              ? `DB Connected (Port ${dbStatus.port || 27017} • Persistent Disk)`
              : "DB Disconnected"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                backgroundColor: user.role === "admin" ? "#e0e7ff" : "#f1f5f9",
                color: user.role === "admin" ? "#4338ca" : "#475569",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {user.role || "Teacher"}
            </span>
          </div>
        )}
        {user && (
          <button
            className="btn btn-red"
            style={{ padding: "6px 12px", fontSize: 12 }}
            onClick={onLogout}
          >
            Logout
          </button>
        )}
      </div>
    </div>
  );
}
