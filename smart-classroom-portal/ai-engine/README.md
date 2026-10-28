# 🤖 Smart Classroom Computer Vision & AI Engine

An integrated deep learning pipeline for **Automated Student Presence (Attendance)** and **Real-Time Student Behavior Detection** designed for the **Smart Classroom & Attendance Analytics Portal**.

---

## 🚀 Features & Architecture

```
                                  [ Classroom Camera / Video Stream ]
                                                  │
                        ┌─────────────────────────┴─────────────────────────┐
                        ▼                                                   ▼
            [ Face Recognition (Presence) ]                       [ YOLOv8 (Behavior) ]
             MTCNN Face Crop + FaceNet 512-D                        Real-time Action Detector
             Cosine Similarity Matching                             Multi-class Bounding Box
                        │                                                   │
                        └─────────────────────────┬─────────────────────────┘
                                                  ▼
                               [ Spatial Association & HUD ]
                         Links Student Identity + Current Behavior
                         Overlay: Name, Roll No, Present, Behavior (e.g. Studying)
                                                  │
                                                  ▼
                                  [ MERN Portal REST Sync ]
                        POST /api/attendance/manual  (Present/Absent)
                        POST /api/behavior/manual    (Studying, Sleeping, Speaking...)
```

### 1. Student Presence Tracking (Attendance)
* **Face Detection**: MTCNN / OpenCV DNN.
* **Embedding Model**: FaceNet (`InceptionResnetV1` pretrained on VGGFace2).
* **Identity Matching**: Cosine similarity against enrolled student embeddings stored in `face_database.pkl`.
* **Output**: Automatically marks enrolled students **Present** or **Absent**.

### 2. Student Behavior Classification
* **Model**: Ultralytics **YOLOv8 / YOLO11** fine-tuned for classroom monitoring.
* **Target Classes**:
  1. `studying` — Attentive posture, looking at notebook, reading, or writing.
  2. `sleeping` — Head resting down on desk, eyes closed, slumped posture.
  3. `speaking` — Talking to neighboring students, head turned sideways, mouth moving.
  4. `phone_use` — Holding or looking down at smartphone.
  5. `raising_hand` — Arm raised for question/participation.
  6. `distracted` — Looking away, fidgeting.

---

## 📁 Directory Structure

```
smart-classroom-portal/ai-engine/
├── smart_classroom_ai_training.ipynb  # Ready-to-run Google Colab Notebook (Free GPU)
├── dataset.yaml                       # YOLOv8 behavior dataset configuration
├── train_behavior_yolo.py             # Standalone YOLO training script
├── enroll_students.py                 # Student face enrollment tool (Webcam or Photos)
├── classroom_ai_engine.py             # Real-time inference engine (Camera -> Backend)
├── sync_to_backend.py                 # REST client talking to Express backend
├── requirements.txt                   # PyTorch, Ultralytics, FaceNet, OpenCV
└── weights/
    └── behavior_best.pt               # Trained YOLO weights (placed after training)
```

---

## ⚡ Option 1: Train in Google Colab (Recommended - Free GPU)

No local GPU or complex setup is required.

1. Open [Google Colab](https://colab.research.google.com).
2. Click **Upload** and choose:
   `smart-classroom-portal/ai-engine/smart_classroom_ai_training.ipynb`.
3. In Colab, go to **Runtime > Change runtime type** and select **T4 GPU**.
4. Run each cell sequentially:
   - Cell 1 verifies GPU & installs `ultralytics` and `facenet-pytorch`.
   - Cell 2 & 3 configure the behavior dataset.
   - Cell 4 runs YOLOv8 fine-tuning for 25–50 epochs.
   - Cell 5 evaluates precision, recall, and mAP curves.
   - Cell 6 enrolls face samples.
   - Cell 7 exports and downloads `behavior_best.pt`.
5. Move the downloaded `behavior_best.pt` file into:
   `smart-classroom-portal/ai-engine/weights/behavior_best.pt`.

---

## 💻 Option 2: Train & Run Locally on Windows

### Step 1: Install Python
If Python is not yet installed on your system, install Python 3.11 via Windows Terminal (PowerShell):
```powershell
winget install Python.Python.3.11
```
*(Restart your terminal after installation)*.

### Step 2: Install Python Dependencies
```powershell
cd "d:\smaart class room\smart-classroom-portal\ai-engine"
pip install -r requirements.txt
```

### Step 3: Enroll Student Faces
Before running attendance, enroll your classroom students:
```powershell
python enroll_students.py
```
- Select **1** to capture face samples using your webcam (press `SPACE` to capture 15 frames).
- Select **2** to enroll from a folder of student photos.
- Student embeddings will be saved to `face_database.pkl`.

### Step 4: Train Behavior Model Locally
```powershell
python train_behavior_yolo.py --epochs 50 --batch 16 --device 0
```
*(If no GPU is available locally, run on Colab or use `--device cpu` for lightweight testing)*.

---

## 🎥 Running Real-Time Classroom Monitoring

Make sure your MERN backend is running (`npm run dev` in `backend/` on port 5000).

Run the AI engine:
```powershell
# Using default webcam (camera 0):
python classroom_ai_engine.py --source 0

# Or run on a recorded classroom video file:
python classroom_ai_engine.py --source "path/to/classroom_video.mp4"
```

### Live Controls in the Camera Window
| Key | Action |
|-----|--------|
| **`S`** | Manually force sync attendance & behavior snapshot to MongoDB portal |
| **`A`** | Toggle periodic auto-sync (defaults to every 30 seconds) |
| **`Q`** | Quit monitoring and sync final session summary |

---

## 🌐 Dataset Recommendations (Roboflow & SCB)
To train on thousands of classroom images:
1. **Roboflow Universe**: Search for `Student Behavior Detection` or `Classroom Action Recognition`. Export in **YOLOv8** format.
2. **SCB-Dataset (Student Classroom Behavior)**: Contains annotated postures for hand-raising, reading, writing, sleeping, and using phone.
3. Unzip the dataset into `smart-classroom-portal/ai-engine/dataset/` matching `dataset.yaml`.
