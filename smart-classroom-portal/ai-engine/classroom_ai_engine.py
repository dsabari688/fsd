"""
Smart Classroom Real-Time AI Engine
Unified Computer Vision Pipeline:
1. Face Recognition & Presence Tracking (Marks student Present / Absent)
2. Student Behavior Classification (Identifies Studying, Sleeping, Speaking, Phone Use, etc.)
3. Live HUD Display & Automatic Synchronization with the MERN Backend Portal
"""

import os
import sys
import cv2
import time
import pickle
import argparse
import numpy as np
import torch
from PIL import Image

ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)

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

from sync_to_backend import BackendSyncClient

# Color Palette for Behaviors (BGR format for OpenCV)
BEHAVIOR_COLORS = {
    "studying":     (50, 205, 50),    # Lime Green
    "attentive":    (50, 205, 50),    # Lime Green
    "sleeping":     (50, 50, 230),    # Vivid Red
    "speaking":     (30, 144, 255),   # Orange-Dodger
    "talking":      (30, 144, 255),   # Orange-Dodger
    "phone_use":    (211, 85, 186),   # Violet / Purple
    "raising_hand": (230, 216, 26),   # Cyan / Sky
    "distracted":   (0, 215, 255),    # Gold / Amber
    "unknown":      (180, 180, 180),  # Gray
}

CLASS_MAP = {
    0: "studying",
    1: "sleeping",
    2: "speaking",
    3: "phone_use",
    4: "raising_hand",
    5: "distracted"
}

class ClassroomAIEngine:
    def __init__(self, 
                 weights_path=None, 
                 db_path=None, 
                 backend_url="http://localhost:5000/api",
                 classroom_id=""):
        
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        print(f"[Classroom AI] Running pipeline on: {self.device}")

        # 1. Load YOLO Behavior Model
        if weights_path is None:
            weights_path = os.path.join(ENGINE_DIR, "weights", "behavior_best.pt")
        elif not os.path.isabs(weights_path):
            weights_path = os.path.join(ENGINE_DIR, weights_path)
        self.weights_path = weights_path

        base_yolo = os.path.join(ENGINE_DIR, "yolov8n.pt")
        if YOLO_AVAILABLE:
            if os.path.exists(weights_path):
                print(f"[Classroom AI] Loading custom behavior model: {weights_path}")
                self.yolo = YOLO(weights_path)
            elif os.path.exists(base_yolo):
                print(f"[Classroom AI] Using base detector: {base_yolo}")
                self.yolo = YOLO(base_yolo)
            elif os.path.exists("yolov8n.pt"):
                print(f"[Classroom AI] Custom weights '{weights_path}' not found yet. Using base yolov8n.pt detector.")
                self.yolo = YOLO("yolov8n.pt")
            else:
                self.yolo = None
        else:
            self.yolo = None

        # 2. Load Face Database for Presence (FaceNet / Embeddings)
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

        if hasattr(cv2, "CascadeClassifier") and hasattr(cv2, "data"):
            try:
                cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                self.face_cascade = cv2.CascadeClassifier(cascade_path)
            except Exception:
                self.face_cascade = None
        else:
            self.face_cascade = None

        # 3. Backend Client & Classroom ID
        self.backend = BackendSyncClient(base_url=backend_url)
        self.classroom_id = classroom_id

        # Runtime Tracking State
        self.present_students = set()
        self.latest_behaviors = {}  # rollNumber -> behavior
        self.last_sync_time = time.time()
        self.auto_sync_interval = 30  # seconds
        self.auto_sync_enabled = True

    def load_face_database(self, path):
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    db = pickle.load(f)
                    print(f"[Classroom AI] Loaded face database with {len(db)} students.")
                    return db
            except Exception as e:
                print(f"[Classroom AI] Error loading face database: {e}")
        print("[Classroom AI] No face database found. Enrolled students = 0.")
        return {}

    def save_face_database(self):
        try:
            with open(self.db_path, "wb") as f:
                pickle.dump(self.face_db, f)
            print(f"[Classroom AI] Saved face database with {len(self.face_db)} students to {self.db_path}")
            return True
        except Exception as e:
            print(f"[Classroom AI] Error saving face database: {e}")
            return False

    def extract_face_embedding(self, face_bgr):
        """Extracts normalized 512-D embedding from cropped face."""
        if face_bgr is None or face_bgr.size == 0:
            return None

        if FACENET_AVAILABLE and self.resnet is not None:
            try:
                rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
                face_tensor = None
                if self.mtcnn is not None:
                    pil_img = Image.fromarray(rgb)
                    face_tensor = self.mtcnn(pil_img)

                # Fallback if MTCNN does not detect a face in the tight crop:
                # Direct resize the cropped face to 160x160 and normalize for InceptionResnetV1
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

    def match_student(self, embedding, threshold=0.52):
        """Matches face embedding against enrolled student database using cosine similarity."""
        if not self.face_db or embedding is None:
            return None, 0.0

        emb = np.asarray(embedding, dtype=np.float32).flatten()
        if emb.shape[0] != 512:
            return None, 0.0

        best_match = None
        best_sim = -1.0

        for roll, info in self.face_db.items():
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

    def analyze_facial_behavior(self, gray, landmarks, student_id):
        """
        Analyzes 5-point facial landmarks and eye/mouth patches to detect:
        1. 'sleeping'  -> Eyes closed for >= 3 frames, or head tilted down
        2. 'speaking'  -> Mouth opened / dynamic jaw movement while talking
        3. 'studying'  -> Attentive forward-facing posture with open eyes
        """
        if landmarks is None or len(landmarks) < 5:
            return "studying", 0.90

        pts = landmarks
        lx, ly = pts[0]
        rx, ry = pts[1]
        nx, ny = pts[2]
        lmx, lmy = pts[3]
        rmx, rmy = pts[4]

        deye = float(np.hypot(rx - lx, ry - ly))
        if deye < 15:
            return "studying", 0.90

        w_mouth = float(np.hypot(rmx - lmx, rmy - lmy))
        mcx, mcy = (lmx + rmx) / 2.0, (lmy + rmy) / 2.0
        h_frame, w_frame = gray.shape

        if not hasattr(self, "student_behavior_state"):
            self.student_behavior_state = {}

        if student_id not in self.student_behavior_state:
            self.student_behavior_state[student_id] = {
                "closed_eye_frames": 0,
                "speaking_timer": 0,
                "prev_mouth_patch": None,
                "current_behavior": "studying"
            }
        state = self.student_behavior_state[student_id]

        # -------------------------------------------------------------
        # 1. EYE CLOSURE DETECTION (Sleeping / Drowsy)
        # -------------------------------------------------------------
        ew = max(6, int(deye * 0.18))
        eh = max(4, int(deye * 0.13))

        eyes_closed_detected = False
        eye_metrics = []

        for (ex, ey) in [(lx, ly), (rx, ry)]:
            x1, x2 = max(0, int(ex - ew)), min(w_frame, int(ex + ew))
            y1, y2 = max(0, int(ey - eh)), min(h_frame, int(ey + eh))
            if x2 > x1 and y2 > y1:
                patch = gray[y1:y2, x1:x2]
                p_mean = float(np.mean(patch))
                p_min = float(np.min(patch))
                contrast = (p_mean - p_min) / (p_mean + 1e-5)
                dark_ratio = float(np.sum(patch < (p_mean * 0.72))) / patch.size
                sobel_y = float(np.mean(np.abs(cv2.Sobel(patch, cv2.CV_64F, 0, 1, ksize=3))))
                eye_metrics.append((dark_ratio, sobel_y, contrast))

        if len(eye_metrics) == 2:
            avg_dark = (eye_metrics[0][0] + eye_metrics[1][0]) / 2.0
            avg_sobel = (eye_metrics[0][1] + eye_metrics[1][1]) / 2.0
            avg_contrast = (eye_metrics[0][2] + eye_metrics[1][2]) / 2.0

            # Eye closure signature: dark pupil vanishes, vertical edge energy drops
            if (avg_dark < 0.10 and avg_sobel < 16.0) or (avg_contrast < 0.35 and avg_dark < 0.12):
                eyes_closed_detected = True

        if eyes_closed_detected:
            state["closed_eye_frames"] += 1
        else:
            state["closed_eye_frames"] = max(0, state["closed_eye_frames"] - 2)

        # -------------------------------------------------------------
        # 2. MOUTH OPENING / SPEAKING DETECTION
        # -------------------------------------------------------------
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

            center_cols = mouth_patch[:, 14:26]
            col_dark = center_cols < (m_mean * 0.70)
            rows_with_cavity = np.where(np.sum(col_dark, axis=1) > 2)[0]
            opening_span = (rows_with_cavity[-1] - rows_with_cavity[0]) if len(rows_with_cavity) > 0 else 0

            motion = 0.0
            if state["prev_mouth_patch"] is not None:
                motion = float(np.mean(cv2.absdiff(mouth_patch, state["prev_mouth_patch"])))
            state["prev_mouth_patch"] = mouth_patch

            jaw_drop = (mcy - ny) / (deye + 1e-5)

            if (dark_cavity_ratio > 0.08 and opening_span >= 4) or (jaw_drop > 0.74 and dark_cavity_ratio > 0.05) or (motion > 6.0 and dark_cavity_ratio > 0.04):
                mouth_open = True
                speaking_conf = min(0.98, 0.88 + (dark_cavity_ratio * 0.4) + (motion * 0.01))

        if mouth_open:
            state["speaking_timer"] = 15

        # -------------------------------------------------------------
        # 3. BEHAVIOR DECISION
        # -------------------------------------------------------------
        if state["closed_eye_frames"] >= 3:
            return "sleeping", 0.95
        elif state["speaking_timer"] > 0:
            state["speaking_timer"] -= 1
            return "speaking", speaking_conf
        else:
            return "studying", 0.92

    def run_stream(self, source=0):
        """Main real-time detection & display loop."""
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"[ERROR] Could not open video source: {source}")
            return

        print("\n" + "=" * 60)
        print(" Smart Classroom AI Engine Started")
        print(" Press 'Q' to quit")
        print(" Press 'S' to manually trigger backend synchronization")
        print(" Press 'A' to toggle auto-sync (currently ON)")
        print("=" * 60 + "\n")

        fps = 0.0
        frame_count = 0
        start_time = time.time()
        status_msg = ""
        status_msg_time = 0.0

        while True:
            ret, frame = cap.read()
            if not ret:
                print("End of stream or failed to fetch frame.")
                break

            frame_count += 1
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

            # 2. Run Face Detection & Landmark Extraction
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

            # If MTCNN detected no faces, use OpenCV Haar cascade fallback
            if not face_boxes and hasattr(self, "face_cascade") and self.face_cascade is not None:
                faces = self.face_cascade.detectMultiScale(gray, 1.15, 4, minSize=(60, 60))
                for (fx, fy, fw_b, fh_b) in faces:
                    face_boxes.append({
                        "box": (fx, fy, fx + fw_b, fy + fh_b),
                        "landmarks": None
                    })

            # 3. Associate Identity + Behavior for Every Student in Frame
            active_students = []
            b_counts = {"studying": 0, "sleeping": 0, "speaking": 0, "phone_use": 0}

            for f_idx, f_entry in enumerate(face_boxes):
                fx1, fy1, fx2, fy2 = f_entry["box"]
                f_lm = f_entry["landmarks"]
                crop = frame[fy1:fy2, fx1:fx2]
                emb = self.extract_face_embedding(crop)
                matched_info, sim = self.match_student(emb) if emb is not None else (None, 0.0)

                fcx, fcy = (fx1 + fx2) // 2, (fy1 + fy2) // 2
                student_key = matched_info["rollNumber"] if matched_info else f"unreg_{f_idx}"

                # Real-Time Facial Expression (Eye Closure & Mouth Opening) Analysis
                f_behavior, f_conf = self.analyze_facial_behavior(gray, f_lm, student_key)
                student_behavior = f_behavior
                student_conf = f_conf

                # Check if overlapping YOLO behavior box overrides (phone_use, raising_hand)
                for b_info in behavior_boxes:
                    bx1, by1, bx2, by2 = b_info["box"]
                    if bx1 <= fcx <= bx2 and by1 <= fcy <= by2:
                        if b_info["behavior"] in ["phone_use", "raising_hand", "distracted"]:
                            student_behavior = b_info["behavior"]
                            student_conf = b_info["conf"]
                        b_info["claimed"] = True
                        break

                # Expand face box to person / desk torso box for visual bounding
                px1 = max(0, fx1 - int((fx2 - fx1) * 0.35))
                px2 = min(w, fx2 + int((fx2 - fx1) * 0.35))
                py1 = max(0, fy1 - int((fy2 - fy1) * 0.15))
                py2 = min(h, fy2 + int((fy2 - fy1) * 2.0))

                b_key = student_behavior.lower()
                if b_key in b_counts:
                    b_counts[b_key] += 1
                elif b_key in ["attentive"]:
                    b_counts["studying"] += 1
                elif b_key in ["talking"]:
                    b_counts["speaking"] += 1

                active_students.append({
                    "box": (px1, py1, px2, py2),
                    "face_box": (fx1, fy1, fx2, fy2),
                    "student": matched_info,
                    "similarity": sim,
                    "behavior": student_behavior,
                    "conf": student_conf,
                    "embedding": emb
                })

            # Render each student on screen
            for s in active_students:
                bx1, by1, bx2, by2 = s["box"]
                behavior = s["behavior"]
                conf = s["conf"]
                assigned = s["student"]

                color = BEHAVIOR_COLORS.get(behavior.lower(), (50, 205, 50))

                if assigned:
                    roll = assigned["rollNumber"]
                    name = assigned["name"]
                    self.present_students.add(roll)
                    self.latest_behaviors[roll] = behavior
                    label = f"{name} ({roll}) | {behavior.upper()} ({int(conf*100)}%)"
                    sub_label = None
                else:
                    label = f"Student (Not Enrolled) | {behavior.upper()} ({int(conf*100)}%)"
                    sub_label = "[Press 'E' to Enroll]"

                # Draw bounding box
                cv2.rectangle(frame, (bx1, by1), (bx2, by2), color, 2)

                # Draw main label pill
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
                pill_y1 = max(0, by1 - 25)
                cv2.rectangle(frame, (bx1, pill_y1), (bx1 + tw + 12, by1), color, -1)
                cv2.putText(frame, label, (bx1 + 6, max(18, by1 - 7)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)

                # Draw enrollment hint for unregistered faces
                if sub_label:
                    cv2.rectangle(frame, (bx1, by2), (bx1 + 180, by2 + 20), (30, 30, 30), -1)
                    cv2.putText(frame, sub_label, (bx1 + 6, by2 + 15),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA)

            # 4. Draw HUD Dashboard Header
            now = time.time()
            if frame_count % 8 == 0:
                fps = frame_count / (now - start_time)

            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (w, 55), (15, 15, 15), -1)
            cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)

            in_camera_count = len(active_students)
            hud_text = (
                f"IN CAMERA: {in_camera_count}  |  "
                f"PRESENT: {len(self.present_students)}/{len(self.face_db)}  |  "
                f"Studying: {b_counts['studying']}  |  "
                f"Speaking: {b_counts['speaking']}  |  "
                f"Sleeping: {b_counts['sleeping']}  |  "
                f"FPS: {fps:.1f}"
            )
            cv2.putText(frame, hud_text, (20, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.53, (255, 255, 255), 1, cv2.LINE_AA)

            # Draw Toast Notification if active
            if status_msg and (now - status_msg_time < 3.5):
                (mw, mh), _ = cv2.getTextSize(status_msg, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
                cx = (w - mw) // 2
                cv2.rectangle(frame, (cx - 15, 65), (cx + mw + 15, 105), (50, 180, 50), -1)
                cv2.putText(frame, status_msg, (cx, 92), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

            # Bottom Controls bar
            cv2.putText(frame, "Controls: [E] Quick-Enroll Face  [S] Sync to Portal  [A] Auto-Sync (ON)  [Q] Quit",
                        (20, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)

            # 5. Handle Auto Sync Interval
            if self.auto_sync_enabled and (now - self.last_sync_time > self.auto_sync_interval):
                self.sync_data_to_backend()
                self.last_sync_time = now

            cv2.imshow("Smart Classroom - Live AI Monitoring", frame)
            key = cv2.waitKey(1) & 0xFF

            if key == ord('q'):
                print("Exiting AI Engine...")
                break
            elif key == ord('e'):
                # Quick-Enroll all currently unregistered faces in the frame
                enrolled_count = 0
                for s in active_students:
                    if s["student"] is None and s.get("embedding") is not None:
                        new_id = len(self.face_db) + 1
                        new_roll = f"STU-{new_id:02d}"
                        new_name = f"Student {new_id:02d}"
                        self.face_db[new_roll] = {
                            "rollNumber": new_roll,
                            "name": new_name,
                            "classroom": self.classroom_id,
                            "embedding": s["embedding"],
                            "embeddings": [s["embedding"]],
                            "samples_count": 1
                        }
                        self.present_students.add(new_roll)
                        enrolled_count += 1

                if enrolled_count > 0:
                    self.save_face_database()
                    status_msg = f"Enrolled {enrolled_count} Student(s)! Marked PRESENT."
                    status_msg_time = now
                    print(f"\n[Classroom AI] SUCCESS: Enrolled {enrolled_count} student(s) from camera!")
                else:
                    status_msg = "No new unregistered student face in frame."
                    status_msg_time = now
            elif key == ord('s'):
                print("[Manual Trigger] Synchronizing with MongoDB Backend...")
                self.sync_data_to_backend()
            elif key == ord('a'):
                self.auto_sync_enabled = not self.auto_sync_enabled
                status = "ENABLED" if self.auto_sync_enabled else "DISABLED"
                print(f"[Classroom AI] Auto-sync is now: {status}")

        cap.release()
        cv2.destroyAllWindows()

        # Final sync prompt on session exit
        if self.present_students:
            print("\nClassroom session ended. Syncing final session records to backend...")
            self.sync_data_to_backend()

    def sync_data_to_backend(self):
        """Pushes present/absent attendance and behavior snapshot to MERN server."""
        if not self.classroom_id:
            classrooms = self.backend.get_classrooms()
            if classrooms:
                self.classroom_id = classrooms[0]["_id"]
                print(f"[Sync] Auto-selected classroom: {classrooms[0].get('name')}")
            else:
                print("[Sync] Warning: No classroom found on backend.")
                return

        # Fetch students from backend to match rollNumber -> _id
        backend_students = self.backend.get_students(self.classroom_id)
        if not backend_students:
            print("[Sync] No students retrieved from backend.")
            return

        attendance_records = []
        behavior_events = []

        for student in backend_students:
            roll = student.get("rollNumber")
            s_id = student.get("_id")

            # Presence
            is_present = roll in self.present_students
            attendance_records.append({
                "student": s_id,
                "status": "present" if is_present else "absent"
            })

            # Behavior
            behavior = self.latest_behaviors.get(roll, "attentive" if is_present else "unknown")
            behavior_events.append({
                "student": s_id,
                "behavior": behavior
            })

        self.backend.send_attendance(self.classroom_id, attendance_records)
        self.backend.send_behavior_log(self.classroom_id, behavior_events)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Classroom AI Presence & Behavior Engine")
    parser.add_argument("--source", default=0, help="Camera index (0) or path to video file")
    parser.add_argument("--weights", default="weights/behavior_best.pt", help="Path to trained YOLO weights")
    parser.add_argument("--db", default="face_database.pkl", help="Path to face database file")
    parser.add_argument("--backend", default="http://localhost:5000/api", help="Backend API URL")
    parser.add_argument("--classroom", default="", help="MongoDB Classroom ID")

    args = parser.parse_args()

    # If source is numeric string, cast to int for OpenCV
    src = int(args.source) if str(args.source).isdigit() else args.source

    engine = ClassroomAIEngine(
        weights_path=args.weights,
        db_path=args.db,
        backend_url=args.backend,
        classroom_id=args.classroom
    )
    engine.run_stream(source=src)
