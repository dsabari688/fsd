const express = require("express");
const router = express.Router();
const { spawn } = require("child_process");
const path = require("path");

const AI_VISION_URL = process.env.AI_VISION_URL || "http://127.0.0.1:5001/api/vision";

let aiProcess = null;
let lastSpawnAttempt = 0;

function ensureAIServerRunning() {
  const now = Date.now();
  if (aiProcess && !aiProcess.killed) return;
  if (now - lastSpawnAttempt < 8000) return; // Debounce 8s
  lastSpawnAttempt = now;

  const scriptPath = path.resolve(__dirname, "../../ai-engine/ai_vision_server.py");
  const aiEngineDir = path.resolve(__dirname, "../../ai-engine");

  console.log(`[VisionRoute] Auto-starting AI Vision Server from: ${scriptPath}`);
  try {
    aiProcess = spawn("python", [scriptPath], {
      cwd: aiEngineDir,
      detached: false,
      stdio: "inherit",
    });

    aiProcess.on("error", (err) => {
      console.warn("[VisionRoute] Failed to launch AI Vision Server:", err.message);
      aiProcess = null;
    });

    aiProcess.on("exit", (code) => {
      console.log(`[VisionRoute] AI Vision Server exited with code ${code}`);
      aiProcess = null;
    });
  } catch (err) {
    console.warn("[VisionRoute] Error launching AI Vision process:", err.message);
  }
}

// Clean up child process on backend shutdown
process.on("exit", () => {
  if (aiProcess && !aiProcess.killed) {
    try {
      aiProcess.kill();
    } catch (_) {}
  }
});

// @route GET /api/vision/status
router.get("/status", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/status`);
    if (!response.ok) throw new Error("Vision server returned non-200");
    const data = await response.json();
    res.json({ connected: true, ...data });
  } catch (err) {
    ensureAIServerRunning();
    res.json({
      connected: false,
      camera_active: false,
      message: "AI Vision Server offline or starting up",
      error: err.message,
    });
  }
});

// @route POST /api/vision/start
router.post("/start", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/start`, { method: "POST" });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    ensureAIServerRunning();
    res.json({
      success: true,
      camera_active: true,
      ai_connected: false,
      message: "Starting AI vision engine... Please wait 3-5 seconds",
    });
  }
});

// @route POST /api/vision/launch
router.post("/launch", async (req, res) => {
  ensureAIServerRunning();
  res.json({ success: true, message: "AI Vision Server launch initiated" });
});

// @route POST /api/vision/stop
router.post("/stop", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/stop`, { method: "POST" });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({
      success: true,
      camera_active: false,
      ai_connected: false,
      message: "Camera paused",
    });
  }
});

// @route POST /api/vision/set_classroom
router.post("/set_classroom", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/set_classroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Failed to communicate with AI Vision Server" });
  }
});

// @route POST /api/vision/sync_now
router.post("/sync_now", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/sync_now`, { method: "POST" });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Failed to communicate with AI Vision Server" });
  }
});

// @route POST /api/vision/enroll
router.post("/enroll", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Failed to communicate with AI Vision Server" });
  }
});

// @route POST /api/vision/process_frame
router.post("/process_frame", async (req, res) => {
  try {
    const response = await fetch(`${AI_VISION_URL}/process_frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "Failed to communicate with AI Vision Server" });
  }
});

module.exports = router;
