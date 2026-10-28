"""
Smart Classroom Live AI Computer Vision Server
Integrates:
1. Real-Time Face Recognition (FaceNet MTCNN + InceptionResnetV1) -> Automatically marks student PRESENT
2. Real-Time Student Behavior Detection (YOLOv8 + Facial/Posture Analytics) -> Identifies Studying, Sleeping, Speaking, Phone Use, Raising Hand, Distracted
3. Live MJPEG Video Stream + REST API for Web Portal integration
4. Automatic synchronization of Attendance and Behavior Logs to MongoDB backend
"""

import os
import sys
import cv2
import time
import base64
import pickle
import threading
import numpy as np
import torch
from PIL import Image
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)

from sync_to_backend import BackendSyncClient

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[WARN] ultralytics not installed. Install via pip install ultralytics")

try:
    from facenet_pytorch import MTCNN, InceptionResnetV1
    FACENET_AVAILABLE = True
except ImportError:
    FACENET_AVAILABLE = False
    print("[WARN] facenet-pytorch not installed. Using OpenCV fallback.")

app = Flask(__name__)
CORS(app)

# Visual Colors (BGR for OpenCV)
BEHAVIOR_COLORS = {
    "studying":     (50, 205, 50),    # Lime Green
    "attentive":    (50, 205, 50),    # Lime Green
    "sleeping":     (50, 50, 230),    # Vivid Red
    "speaking":     (30, 144, 255),   # Orange-Dodger
    "talking":      (30, 144, 255),   # Orange-Dodger
    "phone_use":    (211, 85, 186),   # Violet / Purple
    "raising_hand": (230, 216, 26),   # Cyan / Sky
    "distracted":   (0, 215, 255),    # Gold / Amber
    "unknown":      (180, 180, 180),  # Neutral Gray
}

CLASS_MAP = {
    0: "studying",
    1: "sleeping",
    2: "speaking",
    3: "phone_use",
    4: "raising_hand",
    5: "distracted"
}

class LiveVisionEngine:
    def __init__(self,
                 weights_path=None,
                 db_path=None,
                 backend_url="http://localhost:5000/api"):
        
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        print(f"[LiveVision] Initializing models on {self.device}...")

        # 1. Resolve & Load Custom YOLO Behavior Model (or fallback to yolov8n.pt)
        if weights_path is None:
            weights_path = os.path.join(ENGINE_DIR, "weights", "behavior_best.pt")
        elif not os.path.isabs(weights_path):
            weights_path = os.path.join(ENGINE_DIR, weights_path)
        self.weights_path = weights_path

        base_yolo = os.path.join(ENGINE_DIR, "yolov8n.pt")
        if YOLO_AVAILABLE:
            if os.path.exists(weights_path):
                print(f"[LiveVision] Loading custom behavior model: {weights_path}")
                self.yolo = YOLO(weights_path)
            elif os.path.exists(base_yolo):
                print(f"[LiveVision] Using base detector: {base_yolo}")
                self.yolo = YOLO(base_yolo)
            elif os.path.exists("yolov8n.pt"):
                print("[LiveVision] Using base yolov8n.pt detector.")
                self.yolo = YOLO("yolov8n.pt")
            else:
                self.yolo = None
        else:
            self.yolo = None

        # 2. Resolve & Load FaceNet & Face Database
        if db_path is None:
            db_path = os.path.join(ENGINE_DIR, "face_database.pkl")
        elif not os.path.isabs(db_path):
            db_path = os.path.join(ENGINE_DIR, db_path)
        self.db_path = db_path
        self.face_db = self.load_face_database(db_path)

        if FACENET_AVAILABLE:
            self.mtcnn = MTCNN(image_size=160, margin=14, keep_all=True, device=self.device)
            self.resnet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
        else:
            self.mtcnn = None
            self.resnet = None

        # Haar cascade fallback
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception:
            self.face_cascade = None

        # 3. Backend Client
        self.backend = BackendSyncClient(base_url=backend_url)
        self.classroom_id = ""
        self.classroom_name = ""
        self.students_cache = []

        # 4. State Management
        self.camera_active = False
        self.cap = None
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_raw_frame = None
        self.fps = 0.0
        self.present_students = set()         # Set of rollNumbers marked present
        self.latest_behaviors = {}           # rollNumber -> { behavior, conf, time }
        self.active_detections = []          # List of currently detected students in frame
        self.student_behavior_state = {}     # Temporal state for eye closure & speech
        self.last_sync_time = None
        self.sync_count = 0
        self.auto_sync_interval = 30.0       # Auto-sync every 30 seconds
        self.status_toast = "AI Vision Engine Ready"
        self.status_toast_time = time.time()

        # Try auto-detecting initial classroom
        self.auto_init_classroom()

        # Start camera capture thread
        self.capture_thread = threading.Thread(target=self._camera_loop, daemon=True)
        self.capture_thread.start()

    def load_face_database(self, path):
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    db = pickle.load(f)
                    print(f"[LiveVision] Loaded face database with {len(db)} entries.")
                    return db
            except Exception as e:
                print(f"[LiveVision] Error loading face database: {e}")
        return {}

    def save_face_database(self):
        try:
            with open(self.db_path, "wb") as f:
                pickle.dump(self.face_db, f)
            print(f"[LiveVision] Saved {len(self.face_db)} face profiles to {self.db_path}")
            return True
        except Exception as e:
            print(f"[LiveVision] Failed saving face database: {e}")
            return False

    def auto_init_classroom(self):
        try:
            self.backend.authenticate()
            classrooms = self.backend.get_classrooms()
            if classrooms and len(classrooms) > 0:
                target = classrooms[0]
                self.set_classroom(target["_id"], target.get("name", "Classroom"))
                print(f"[LiveVision] Auto-selected classroom: {self.classroom_name} ({self.classroom_id})")
        except Exception as e:
            print(f"[LiveVision] Could not auto-fetch classroom: {e}")

    def set_classroom(self, classroom_id, name=""):
        if self.classroom_id != classroom_id:
            with self.lock:
                self.present_students = set()
                self.latest_behaviors = {}
                self.active_detections = []
                self.student_behavior_state = {}

        self.classroom_id = classroom_id
        self.classroom_name = name or classroom_id
        # Refresh student list for this classroom
        try:
            students = self.backend.get_students(classroom_id)
            self.students_cache = students or []
            print(f"[LiveVision] Classroom '{self.classroom_name}' loaded with {len(self.students_cache)} students.")
        except Exception as e:
            print(f"[LiveVision] Error fetching classroom students: {e}")

    def extract_face_embedding(self, face_bgr):
        """Extracts normalized 512-D embedding from cropped face."""
        if face_bgr is None or face_bgr.size == 0 or self.resnet is None:
            return None
        try:
            rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
            face_tensor = None
            if self.mtcnn is not None:
                pil_img = Image.fromarray(rgb)
                face_tensor = self.mtcnn(pil_img)

            if face_tensor is None:
                resized = cv2.resize(rgb, (160, 160))
                tensor = torch.tensor(resized, dtype=torch.float32).permute(2, 0, 1).unsqueeze(0).to(self.device)
                face_tensor = (tensor - 127.5) / 128.0
            else:
                if face_tensor.ndim == 3:
                    face_tensor = face_tensor.unsqueeze(0).to(self.device)
                elif face_tensor.ndim == 4:
                    face_tensor = face_tensor[0:1].to(self.device)

            with torch.no_grad():
                emb = self.resnet(face_tensor)
            emb_np = emb.squeeze().cpu().numpy()
            norm = np.linalg.norm(emb_np)
            if norm > 0:
                return emb_np / norm
        except Exception:
            pass
        return None

    def match_student(self, embedding, threshold=0.48):
        """Matches face embedding against enrolled student database using cosine similarity."""
        if not self.face_db or embedding is None:
            return None, 0.0

        emb = np.asarray(embedding, dtype=np.float32).flatten()
        if emb.shape[0] != 512:
            return None, 0.0

        best_match = None
        best_sim = -1.0

        # Prioritize matching against students in the currently selected classroom
        classroom_rolls = {s.get("rollNumber") for s in self.students_cache if s.get("rollNumber")}
        ordered_items = sorted(
            self.face_db.items(),
            key=lambda item: (0 if item[0] in classroom_rolls else 1)
        )

        for roll, info in ordered_items:
            if "embeddings" in info and len(info["embeddings"]) > 0:
                sims = [
                    float(np.dot(emb, ex))
                    for ex in info["embeddings"]
                    if ex is not None and getattr(ex, "shape", (len(ex),))[0] == 512
                ]
                sim = max(sims) if sims else -1.0
            else:
                db_emb = info.get("embedding")
                if db_emb is None or len(db_emb) != 512:
                    continue
                sim = float(np.dot(emb, db_emb))

            if sim > best_sim:
                best_sim = sim
                best_match = info
            elif abs(sim - best_sim) < 1e-4 and roll in classroom_rolls:
                # Break ties in favor of the active classroom student
                best_match = info

        if best_sim >= threshold and best_match is not None:
            return best_match, best_sim
        return None, best_sim

    def analyze_facial_behavior(self, gray, landmarks, student_id):
        """
        Analyzes 5-point facial landmarks, head posture, and eye/mouth state:
        1. Alert upright posture facing camera -> 'studying' / 'attentive'
        2. Dynamic mouth motion -> 'speaking'
        3. Head turned sideways -> 'distracted'
        4. Sustained eye closure >= 25 frames (3+ seconds) WITH head pitch droop -> 'sleeping'
        """
        if student_id not in self.student_behavior_state:
            self.student_behavior_state[student_id] = {
                "closed_eye_frames": 0,
                "speaking_timer": 0,
                "prev_mouth_patch": None,
                "current_behavior": "studying"
            }
        state = self.student_behavior_state[student_id]

        if landmarks is None or len(landmarks) < 5:
            return "studying", 0.94

        pts = landmarks
        lx, ly = pts[0]
        rx, ry = pts[1]
        nx, ny = pts[2]
        lmx, lmy = pts[3]
        rmx, rmy = pts[4]

        deye = float(np.hypot(rx - lx, ry - ly))
        if deye < 12:
            return "studying", 0.92

        w_mouth = float(np.hypot(rmx - lmx, rmy - lmy))
        mcx, mcy = (lmx + rmx) / 2.0, (lmy + rmy) / 2.0
        h_frame, w_frame = gray.shape

        # 1. Distraction Check via Yaw (Head Orientation)
        mid_x = (lx + rx) / 2.0
        yaw_ratio = abs(nx - mid_x) / (deye + 1e-5)
        if yaw_ratio > 0.48:
            state["closed_eye_frames"] = max(0, state["closed_eye_frames"] - 4)
            return "distracted", 0.92

        # 2. Head Droop & Sleep Detection
        eye_y = (ly + ry) / 2.0
        eye_to_nose = ny - eye_y
        pitch_ratio = eye_to_nose / (deye + 1e-5)
        head_drooping = (pitch_ratio < 0.22)  # Nose too close to eyes indicates head drooping onto desk

        ew = max(5, int(deye * 0.16))
        eh = max(4, int(deye * 0.12))
        eye_dark_ratios = []

        for (ex, ey) in [(lx, ly), (rx, ry)]:
            x1, x2 = max(0, int(ex - ew)), min(w_frame, int(ex + ew))
            y1, y2 = max(0, int(ey - eh)), min(h_frame, int(ey + eh))
            if x2 > x1 and y2 > y1:
                patch = gray[y1:y2, x1:x2]
                p_mean = float(np.mean(patch))
                dark_ratio = float(np.sum(patch < (p_mean * 0.65))) / patch.size
                eye_dark_ratios.append(dark_ratio)

        # Eyes are only closed if both eye regions lack contrast AND head is nodding/drooping
        eyes_closed_detected = False
        if len(eye_dark_ratios) == 2:
            avg_dark = (eye_dark_ratios[0] + eye_dark_ratios[1]) / 2.0
            if head_drooping and avg_dark < 0.05:
                eyes_closed_detected = True

        if eyes_closed_detected:
            state["closed_eye_frames"] += 1
        else:
            state["closed_eye_frames"] = max(0, state["closed_eye_frames"] - 4)

        # 3. Mouth Opening / Speaking Detection
        mw = max(10, int(w_mouth * 0.30))
        mh_top = max(4, int(w_mouth * 0.18))
        mh_bot = max(4, int(w_mouth * 0.35))
        mx1, mx2 = max(0, int(mcx - mw)), min(w_frame, int(mcx + mw))
        my1, my2 = max(0, int(mcy - mh_top)), min(h_frame, int(mcy + mh_bot))

        mouth_open = False
        speaking_conf = 0.88

        if mx2 > mx1 and my2 > my1:
            mouth_patch = cv2.resize(gray[my1:my2, mx1:mx2], (40, 30))
            m_mean = float(np.mean(mouth_patch))
            dark_cavity_ratio = float(np.sum(mouth_patch < (m_mean * 0.68))) / mouth_patch.size

            motion = 0.0
            if state["prev_mouth_patch"] is not None:
                motion = float(np.mean(cv2.absdiff(mouth_patch, state["prev_mouth_patch"])))
            state["prev_mouth_patch"] = mouth_patch

            if motion > 8.0 and dark_cavity_ratio > 0.06:
                mouth_open = True
                speaking_conf = min(0.98, 0.88 + (motion * 0.01))

        if mouth_open:
            state["speaking_timer"] = 10
            state["closed_eye_frames"] = 0

        # 4. Final Behavioral Decision
        # Require >= 25 consecutive frames (3.5+ seconds of closed eyes WITH head drooping onto desk)
        if state["closed_eye_frames"] >= 25:
            return "sleeping", 0.95
        elif state["speaking_timer"] > 0:
            state["speaking_timer"] -= 1
            return "speaking", speaking_conf
        else:
            return "studying", 0.96

    def process_frame(self, frame):
        """Processes a single BGR frame with YOLO & FaceNet and renders visual HUD."""
        h, w, _ = frame.shape
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1. Run YOLO Behavior Detection
        behavior_boxes = []
        if self.yolo is not None:
            try:
                results = self.yolo.predict(frame, conf=0.20, verbose=False)[0]
                for box in results.boxes:
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

                    if hasattr(results, "names") and cls_id in results.names:
                        behavior_name = results.names[cls_id]
                    else:
                        behavior_name = CLASS_MAP.get(cls_id % len(CLASS_MAP), "studying")

                    behavior_boxes.append({
                        "box": (x1, y1, x2, y2),
                        "behavior": behavior_name,
                        "conf": conf,
                        "claimed": False
                    })
            except Exception:
                pass

        # 2. Run Face Detection & Landmarks
        face_boxes = []
        if FACENET_AVAILABLE and self.mtcnn is not None:
            try:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                detected_boxes, probs, detected_landmarks = self.mtcnn.detect(Image.fromarray(rgb_frame), landmarks=True)
                if detected_boxes is not None:
                    for i, b in enumerate(detected_boxes):
                        fx1, fy1, fx2, fy2 = [max(0, int(v)) for v in b]
                        fx2, fy2 = min(w, fx2), min(h, fy2)
                        if fx2 > fx1 and fy2 > fy1:
                            lm = detected_landmarks[i] if (detected_landmarks is not None and i < len(detected_landmarks)) else None
                            face_boxes.append({
                                "box": (fx1, fy1, fx2, fy2),
                                "landmarks": lm
                            })
            except Exception:
                pass

        # Fallback to Haar Cascade
        if not face_boxes and hasattr(self, "face_cascade") and self.face_cascade is not None:
            faces = self.face_cascade.detectMultiScale(gray, 1.18, 4, minSize=(60, 60))
            for (fx, fy, fw_b, fh_b) in faces:
                face_boxes.append({
                    "box": (fx, fy, fx + fw_b, fy + fh_b),
                    "landmarks": None
                })

        # 3. Associate Student Presence + Behavior
        current_detections = []
        b_counts = {"studying": 0, "sleeping": 0, "speaking": 0, "phone_use": 0, "distracted": 0, "raising_hand": 0}

        for f_idx, f_entry in enumerate(face_boxes):
            fx1, fy1, fx2, fy2 = f_entry["box"]
            f_lm = f_entry["landmarks"]
            crop = frame[fy1:fy2, fx1:fx2]
            emb = self.extract_face_embedding(crop)
            matched_info, sim = self.match_student(emb) if emb is not None else (None, 0.0)

            # If not matched by similarity but there's a cached student and single detection,
            # allow fallback to first classroom student if configured or keep as unregistered
            fcx, fcy = (fx1 + fx2) // 2, (fy1 + fy2) // 2
            student_key = matched_info["rollNumber"] if matched_info else f"unreg_{f_idx}"

            # Facial Action Analysis (Sleeping, Speaking, Distracted, Studying)
            f_behavior, f_conf = self.analyze_facial_behavior(gray, f_lm, student_key)
            student_behavior = f_behavior
            student_conf = f_conf

            # Check if overlapping YOLO object / posture overrides
            for b_info in behavior_boxes:
                bx1, by1, bx2, by2 = b_info["box"]
                if bx1 <= fcx <= bx2 and by1 <= fcy <= by2:
                    if b_info["behavior"] in ["phone_use", "raising_hand", "distracted"]:
                        student_behavior = b_info["behavior"]
                        student_conf = b_info["conf"]
                    b_info["claimed"] = True
                    break

            # Person bounding box around face + upper body
            px1 = max(0, fx1 - int((fx2 - fx1) * 0.35))
            px2 = min(w, fx2 + int((fx2 - fx1) * 0.35))
            py1 = max(0, fy1 - int((fy2 - fy1) * 0.15))
            py2 = min(h, fy2 + int((fy2 - fy1) * 2.1))

            b_key = student_behavior.lower()
            if b_key in b_counts:
                b_counts[b_key] += 1
            elif b_key in ["attentive"]:
                b_counts["studying"] += 1
            elif b_key in ["talking"]:
                b_counts["speaking"] += 1

            detection_item = {
                "box": (px1, py1, px2, py2),
                "face_box": (fx1, fy1, fx2, fy2),
                "student": matched_info,
                "similarity": float(sim),
                "behavior": student_behavior,
                "conf": float(student_conf),
                "embedding": emb
            }
            current_detections.append(detection_item)

            if matched_info:
                roll = matched_info["rollNumber"]
                self.present_students.add(roll)
                self.latest_behaviors[roll] = {
                    "behavior": student_behavior,
                    "conf": float(student_conf),
                    "time": time.time(),
                    "name": matched_info.get("name", roll)
                }

        self.active_detections = current_detections

        # 4. Render HUD & Bounding Boxes
        annotated = frame.copy()

        for s in current_detections:
            bx1, py1, bx2, py2 = s["box"]
            fx1, fy1, fx2, fy2 = s["face_box"]
            behavior = s["behavior"]
            conf = s["conf"]
            assigned = s["student"]

            color = BEHAVIOR_COLORS.get(behavior.lower(), (50, 205, 50))

            if assigned:
                roll = assigned["rollNumber"]
                name = assigned["name"]
                top_label = f"PRESENT: {name} ({roll})"
                bot_label = f"{behavior.upper()} ({int(conf * 100)}%)"
            else:
                top_label = "Student (Unregistered Face)"
                bot_label = f"{behavior.upper()} ({int(conf * 100)}%) | [Enroll via Portal]"

            # Draw outer bounding box
            cv2.rectangle(annotated, (bx1, py1), (bx2, py2), color, 2)

            # Draw face inner box
            cv2.rectangle(annotated, (fx1, fy1), (fx2, fy2), (255, 255, 255), 1)

            # Top label pill (Present / Name)
            (tw, th), _ = cv2.getTextSize(top_label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
            pill_y1 = max(0, py1 - 26)
            cv2.rectangle(annotated, (bx1, pill_y1), (bx1 + tw + 14, py1), (25, 25, 25), -1)
            cv2.rectangle(annotated, (bx1, pill_y1), (bx1 + tw + 14, py1), color, 1)
            cv2.putText(annotated, top_label, (bx1 + 7, py1 - 7),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)

            # Bottom behavior pill
            (bw, bh), _ = cv2.getTextSize(bot_label, cv2.FONT_HERSHEY_SIMPLEX, 0.46, 1)
            cv2.rectangle(annotated, (bx1, py2), (bx1 + bw + 14, py2 + 22), color, -1)
            cv2.putText(annotated, bot_label, (bx1 + 7, py2 + 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)

        # Top HUD Dashboard Bar
        overlay = annotated.copy()
        cv2.rectangle(overlay, (0, 0), (w, 52), (18, 22, 28), -1)
        cv2.addWeighted(overlay, 0.88, annotated, 0.12, 0, annotated)

        hud_title = f"AI VISION LIVE | {self.classroom_name or 'No Classroom Selected'}"
        cv2.putText(annotated, hud_title, (16, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 230, 255), 1, cv2.LINE_AA)

        classroom_rolls = {s.get("rollNumber") for s in self.students_cache if s.get("rollNumber")}
        if classroom_rolls:
            active_present_set = self.present_students.intersection(classroom_rolls)
            active_present_count = len(active_present_set)
            total_students_count = len(self.students_cache)
        else:
            active_present_count = len(self.present_students)
            total_students_count = len(self.students_cache) or 1

        present_total = f"PRESENT: {active_present_count}/{total_students_count}"
        metrics_text = (
            f"{present_total}  |  "
            f"In Frame: {len(current_detections)}  |  "
            f"Studying: {b_counts['studying']}  |  "
            f"Speaking: {b_counts['speaking']}  |  "
            f"Sleeping: {b_counts['sleeping']}  |  "
            f"FPS: {self.fps:.1f}"
        )
        cv2.putText(annotated, metrics_text, (16, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (230, 230, 230), 1, cv2.LINE_AA)

        # Status Toast
        now = time.time()
        if self.status_toast and (now - self.status_toast_time < 3.5):
            (tw, th), _ = cv2.getTextSize(self.status_toast, cv2.FONT_HERSHEY_SIMPLEX, 0.58, 2)
            cx = (w - tw) // 2
            cv2.rectangle(annotated, (cx - 15, 60), (cx + tw + 15, 96), (34, 139, 34), -1)
            cv2.putText(annotated, self.status_toast, (cx, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

        return annotated, current_detections

    def create_placeholder_frame(self, message="AI Vision Engine Initializing Camera..."):
        """Generates a clean dashboard placeholder frame when camera is warming up, standby, or paused."""
        h, w = 480, 640
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:] = (20, 26, 35)  # dark slate background

        # Top HUD banner
        cv2.rectangle(frame, (0, 0), (w, 52), (12, 16, 24), -1)
        hud_title = f"AI VISION LIVE HUD | {self.classroom_name or 'Ready'}"
        cv2.putText(frame, hud_title, (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 230, 255), 1, cv2.LINE_AA)
        cv2.putText(frame, "Real-Time Face Recognition + YOLOv8 Pipeline Active", (16, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (148, 163, 184), 1, cv2.LINE_AA)

        # Center Status message card
        (tw, th), _ = cv2.getTextSize(message, cv2.FONT_HERSHEY_SIMPLEX, 0.60, 2)
        cx = (w - tw) // 2
        cy = h // 2
        cv2.rectangle(frame, (max(10, cx - 20), cy - 28), (min(w - 10, cx + tw + 20), cy + 18), (30, 41, 59), -1)
        cv2.rectangle(frame, (max(10, cx - 20), cy - 28), (min(w - 10, cx + tw + 20), cy + 18), (56, 189, 248), 1)
        cv2.putText(frame, message, (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA)

        # Bottom info
        time_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"System Time: {time_str} | Present Cache: {len(self.present_students)}", (16, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (100, 116, 139), 1, cv2.LINE_AA)

        return frame

    def _camera_loop(self):
        """Dedicated background thread capturing webcam frames and computing vision."""
        frame_idx = 0
        t0 = time.time()

        while True:
            if not self.camera_active:
                time.sleep(0.15)
                continue

            if self.cap is None or not self.cap.isOpened():
                print("[LiveVision] Opening camera device index 0...")
                # On Windows, try DirectShow first for fast startup, with default fallback
                try:
                    if os.name == 'nt' and hasattr(cv2, 'CAP_DSHOW'):
                        self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
                    else:
                        self.cap = cv2.VideoCapture(0)
                except Exception:
                    self.cap = cv2.VideoCapture(0)

                if self.cap is None or not self.cap.isOpened():
                    print("[LiveVision] Warning: Camera 0 not immediately accessible, retrying...")
                    standby = self.create_placeholder_frame("Camera 0 Initializing / Standby...")
                    with self.lock:
                        self.latest_frame = standby
                    time.sleep(1.0)
                    continue

                # Set camera resolution
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

            ret, frame = self.cap.read()
            if not ret or frame is None:
                time.sleep(0.05)
                continue

            frame_idx += 1
            now = time.time()
            if frame_idx % 8 == 0:
                self.fps = frame_idx / (now - t0 + 1e-5)

            try:
                annotated, detections = self.process_frame(frame)
                with self.lock:
                    self.latest_raw_frame = frame
                    self.latest_frame = annotated

                # Auto-sync to MongoDB every interval
                if self.classroom_id and (now - (self.last_sync_time or 0) > self.auto_sync_interval):
                    try:
                        self.sync_to_backend()
                        self.last_sync_time = now
                    except Exception as sync_e:
                        print(f"[LiveVision] Auto-sync notice: {sync_e}")

            except Exception as e:
                print(f"[LiveVision] Error in frame processing: {e}")

            time.sleep(0.015)

    def start_camera(self):
        with self.lock:
            self.camera_active = True
            self.status_toast = "Live Camera Started"
            self.status_toast_time = time.time()
            if self.latest_frame is None:
                self.latest_frame = self.create_placeholder_frame("Live Camera Starting...")
            return True

    def stop_camera(self):
        with self.lock:
            self.camera_active = False
            if self.cap is not None and self.cap.isOpened():
                self.cap.release()
                self.cap = None
            self.status_toast = "Camera Paused"
            self.status_toast_time = time.time()
            self.latest_frame = self.create_placeholder_frame("Camera Paused - Click Start to Resume")
            return True

    def sync_to_backend(self):
        """Pushes current Attendance and Behavior logs to MongoDB."""
        if not self.classroom_id:
            print("[LiveVision] Cannot sync: No classroom selected.")
            return False, "No classroom selected"

        if not self.students_cache:
            try:
                self.students_cache = self.backend.get_students(self.classroom_id)
            except Exception:
                pass

        if not self.students_cache:
            return False, "No students in this classroom to sync"

        attendance_records = []
        behavior_events = []

        for student in self.students_cache:
            roll = student.get("rollNumber")
            s_id = student.get("_id")
            if not s_id:
                continue

            # Presence check
            is_present = roll in self.present_students
            attendance_records.append({
                "student": s_id,
                "status": "present" if is_present else "absent"
            })

            # Behavior check
            b_info = self.latest_behaviors.get(roll)
            behavior_name = b_info["behavior"] if b_info else ("attentive" if is_present else "unknown")
            behavior_events.append({
                "student": s_id,
                "behavior": behavior_name
            })

        ok1 = self.backend.send_attendance(self.classroom_id, attendance_records)
        ok2 = self.backend.send_behavior_log(self.classroom_id, behavior_events)

        if ok1 or ok2:
            self.sync_count += 1
            present_c = len([r for r in attendance_records if r["status"] == "present"])
            self.status_toast = f"Synced {present_c} Present to DB"
            self.status_toast_time = time.time()
            print(f"[LiveVision] Sync #{self.sync_count} complete: {present_c} students present recorded.")
            return True, f"Successfully recorded {present_c} present students"
        return False, "Sync failed to reach backend"

    def enroll_current_face(self, roll_number, name):
        """Enrolls the currently detected face in front of the camera as the given student."""
        with self.lock:
            frame = self.latest_raw_frame
            detections = list(self.active_detections)

        if frame is None or not detections:
            return False, "No face currently detected in front of the camera"

        # Find best detection with embedding
        target_det = next((d for d in detections if d.get("embedding") is not None), None)
        if target_det is None:
            # Try computing embedding from first face box
            fx1, fy1, fx2, fy2 = detections[0]["face_box"]
            crop = frame[fy1:fy2, fx1:fx2]
            emb = self.extract_face_embedding(crop)
        else:
            emb = target_det["embedding"]

        if emb is None:
            return False, "Could not extract facial embedding. Please face the camera directly."

        # Add / update database entry
        if roll_number in self.face_db:
            entry = self.face_db[roll_number]
            entry["name"] = name
            entry["embedding"] = emb
            if "embeddings" not in entry:
                entry["embeddings"] = []
            entry["embeddings"].append(emb)
            entry["samples_count"] = len(entry["embeddings"])
        else:
            self.face_db[roll_number] = {
                "rollNumber": roll_number,
                "name": name,
                "classroom": self.classroom_id,
                "embedding": emb,
                "embeddings": [emb],
                "samples_count": 1
            }

        self.save_face_database()
        self.present_students.add(roll_number)
        self.status_toast = f"Enrolled {name} ({roll_number})!"
        self.status_toast_time = time.time()
        print(f"[LiveVision] SUCCESS: Enrolled student {name} ({roll_number}) with live embedding!")
        return True, f"Successfully enrolled {name} ({roll_number})"


# Instantiate Global Engine
vision_engine = LiveVisionEngine()

# Automatically start camera on launch
vision_engine.start_camera()


# -------------------------------------------------------------------------
# HTTP & STREAMING ENDPOINTS
# -------------------------------------------------------------------------

@app.route("/api/vision/status", methods=["GET"])
def get_status():
    """Returns current live camera state, active classroom, present students, and behaviors."""
    c_rolls = {s.get("rollNumber") for s in vision_engine.students_cache if s.get("rollNumber")}
    if c_rolls:
        active_present = list(vision_engine.present_students.intersection(c_rolls))
        active_behaviors = {k: v for k, v in vision_engine.latest_behaviors.items() if k in c_rolls}
        total_enrolled = len(vision_engine.students_cache)
    else:
        active_present = list(vision_engine.present_students)
        active_behaviors = vision_engine.latest_behaviors
        total_enrolled = len(vision_engine.students_cache) or len(vision_engine.face_db) or 1

    return jsonify({
        "camera_active": vision_engine.camera_active,
        "classroom_id": vision_engine.classroom_id,
        "classroom_name": vision_engine.classroom_name,
        "fps": round(vision_engine.fps, 1),
        "in_camera_count": len(vision_engine.active_detections),
        "present_count": len(active_present),
        "total_enrolled": total_enrolled,
        "present_students": active_present,
        "latest_behaviors": active_behaviors,
        "active_detections": [
            {
                "rollNumber": d["student"]["rollNumber"] if d["student"] else None,
                "name": d["student"]["name"] if d["student"] else "Unregistered",
                "similarity": d["similarity"],
                "behavior": d["behavior"],
                "conf": d["conf"]
            }
            for d in vision_engine.active_detections
        ],
        "sync_count": vision_engine.sync_count,
        "last_sync_time": vision_engine.last_sync_time,
        "enrolled_students": [
            {"rollNumber": s.get("rollNumber"), "name": s.get("name"), "_id": s.get("_id")}
            for s in vision_engine.students_cache
        ]
    })

@app.route("/api/vision/start", methods=["POST"])
def start_camera_endpoint():
    vision_engine.start_camera()
    return jsonify({"success": True, "message": "Camera started"})

@app.route("/api/vision/stop", methods=["POST"])
def stop_camera_endpoint():
    vision_engine.stop_camera()
    return jsonify({"success": True, "message": "Camera stopped"})

@app.route("/api/vision/set_classroom", methods=["POST"])
def set_classroom_endpoint():
    data = request.json or {}
    cid = data.get("classroom_id")
    name = data.get("name", "")
    if cid:
        vision_engine.set_classroom(cid, name)
        return jsonify({"success": True, "classroom_id": cid, "classroom_name": vision_engine.classroom_name})
    return jsonify({"error": "classroom_id required"}), 400

@app.route("/api/vision/sync_now", methods=["POST"])
def sync_now_endpoint():
    ok, msg = vision_engine.sync_to_backend()
    return jsonify({"success": ok, "message": msg})

@app.route("/api/vision/enroll", methods=["POST"])
def enroll_face_endpoint():
    data = request.json or {}
    roll = data.get("rollNumber")
    name = data.get("name", roll)
    if not roll:
        return jsonify({"error": "rollNumber is required"}), 400
    ok, msg = vision_engine.enroll_current_face(roll, name)
    return jsonify({"success": ok, "message": msg})

@app.route("/api/vision/process_frame", methods=["POST"])
def process_browser_frame():
    """Browser Webcam Mode: takes base64 frame from frontend, runs AI inference, returns results."""
    data = request.json or {}
    b64_data = data.get("image")
    if not b64_data:
        return jsonify({"error": "No image data"}), 400

    try:
        if "," in b64_data:
            b64_data = b64_data.split(",")[1]
        img_bytes = base64.b64decode(b64_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        annotated, detections = vision_engine.process_frame(frame)
        ret, buffer = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            "annotated_image": annotated_b64,
            "present_students": list(vision_engine.present_students),
            "detections": [
                {
                    "rollNumber": d["student"]["rollNumber"] if d["student"] else None,
                    "name": d["student"]["name"] if d["student"] else "Unregistered",
                    "behavior": d["behavior"],
                    "conf": d["conf"]
                }
                for d in detections
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def generate_mjpeg_stream():
    """Generator function that yields JPEG frames for MJPEG video stream."""
    while True:
        with vision_engine.lock:
            frame = vision_engine.latest_frame

        if frame is None:
            frame = vision_engine.create_placeholder_frame("AI Vision Initializing...")

        ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if ret:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        time.sleep(0.035)

@app.route("/api/vision/stream")
def video_feed():
    """MJPEG video feed endpoint for real-time web display."""
    return Response(generate_mjpeg_stream(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


if __name__ == "__main__":
    print("\n" + "=" * 65)
    print(" Smart Classroom Live AI Computer Vision Server")
    print(" Running at: http://localhost:5001")
    print(" Stream URL: http://localhost:5001/api/vision/stream")
    print(" Status API: http://localhost:5001/api/vision/status")
    print("=" * 65 + "\n")
    app.run(host="0.0.0.0", port=5001, threaded=True, debug=False, use_reloader=False)
