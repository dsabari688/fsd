"""
Student Face Enrollment & Embedding Extractor
Enrolls students for automated classroom attendance (presence tracking).
Extracts 512-dimensional facial embeddings using FaceNet / OpenCV
and stores them in a local database (face_database.pkl) for real-time recognition.
"""

import os
import cv2
import pickle
import numpy as np
import torch
from PIL import Image

try:
    from facenet_pytorch import MTCNN, InceptionResnetV1
    FACENET_AVAILABLE = True
except ImportError:
    FACENET_AVAILABLE = False
    print("[WARN] facenet-pytorch not installed. Using OpenCV Haar Cascade fallback.")

DB_FILE = os.path.join(os.path.dirname(__file__), "face_database.pkl")
STUDENT_DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "students")

class StudentEnrollmentSystem:
    def __init__(self):
        os.makedirs(STUDENT_DATA_DIR, exist_ok=True)
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        print(f"[Enrollment] Initializing face recognition models on: {self.device}")

        if FACENET_AVAILABLE:
            self.mtcnn = MTCNN(image_size=160, margin=14, keep_all=False, device=self.device)
            self.resnet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
        else:
            self.mtcnn = None
            self.resnet = None
            # Fallback Haar Cascade
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)

        self.database = self.load_database()

    def load_database(self):
        if os.path.exists(DB_FILE):
            try:
                with open(DB_FILE, "rb") as f:
                    data = pickle.load(f)
                    print(f"[Enrollment] Loaded {len(data)} enrolled students from database.")
                    return data
            except Exception as e:
                print(f"[Enrollment] Failed to load database: {e}")
        return {}

    def save_database(self):
        with open(DB_FILE, "wb") as f:
            pickle.dump(self.database, f)
        print(f"[Enrollment] Database saved with {len(self.database)} students.")

    def compute_embedding(self, face_bgr):
        """Compute 512-dimensional face feature vector."""
        if FACENET_AVAILABLE and self.resnet is not None:
            rgb_img = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb_img)
            face_tensor = self.mtcnn(pil_img)
            if face_tensor is None:
                # Direct resize cropped face to 160x160 for FaceNet
                resized = cv2.resize(face_bgr, (160, 160))
                rgb_res = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
                tensor = torch.tensor(rgb_res, dtype=torch.float32).permute(2, 0, 1).unsqueeze(0).to(self.device)
                face_tensor = (tensor - 127.5) / 128.0
            else:
                face_tensor = face_tensor.unsqueeze(0).to(self.device)

            with torch.no_grad():
                embedding = self.resnet(face_tensor)
            emb_np = embedding.squeeze().cpu().numpy()
            norm = np.linalg.norm(emb_np)
            return emb_np / (norm + 1e-10)
        
        return None

    def enroll_via_webcam(self, roll_number, name, classroom_id="", num_samples=15):
        """Captures face samples using webcam."""
        student_dir = os.path.join(STUDENT_DATA_DIR, roll_number)
        os.makedirs(student_dir, exist_ok=True)

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[ERROR] Could not open webcam.")
            return False

        print(f"\n--- Enrolling Student: {name} (Roll: {roll_number}) ---")
        print("Position your face towards the camera.")
        print("Press SPACE to capture a sample. Need", num_samples, "samples. Press Q to cancel.\n")

        embeddings = []
        count = 0

        while count < num_samples:
            ret, frame = cap.read()
            if not ret:
                break

            h, w, _ = frame.shape
            display_frame = frame.copy()

            # Detect face
            face_crop = None
            if FACENET_AVAILABLE and self.mtcnn is not None:
                boxes, _ = self.mtcnn.detect(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
                if boxes is not None and len(boxes) > 0:
                    box = [int(b) for b in boxes[0]]
                    x1, y1, x2, y2 = max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3])
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    if x2 > x1 and y2 > y1:
                        face_crop = frame[y1:y2, x1:x2]
            else:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)
                for (x, y, fw, fh) in faces:
                    cv2.rectangle(display_frame, (x, y), (x+fw, y+fh), (0, 255, 0), 2)
                    face_crop = frame[y:y+fh, x:x+fw]
                    break

            cv2.putText(display_frame, f"Student: {name} ({roll_number})", (20, 35),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(display_frame, f"Captured: {count}/{num_samples} (SPACE=Capture, Q=Quit)", (20, 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

            cv2.imshow("Student Enrollment", display_frame)
            key = cv2.waitKey(1) & 0xFF

            if key == ord(' '):
                if face_crop is not None and face_crop.size > 0:
                    emb = self.compute_embedding(face_crop)
                    if emb is not None:
                        embeddings.append(emb)
                        img_path = os.path.join(student_dir, f"sample_{count+1}.jpg")
                        cv2.imwrite(img_path, face_crop)
                        count += 1
                        print(f"Captured sample {count}/{num_samples}")
                else:
                    print("No face detected in frame. Please face camera clearly.")
            elif key == ord('q'):
                print("Enrollment cancelled.")
                cap.release()
                cv2.destroyAllWindows()
                return False

        cap.release()
        cv2.destroyAllWindows()

        if len(embeddings) > 0:
            avg_embedding = np.mean(embeddings, axis=0)
            avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-10)

            self.database[roll_number] = {
                "rollNumber": roll_number,
                "name": name,
                "classroom": classroom_id,
                "embedding": avg_embedding,
                "samples_count": len(embeddings)
            }
            self.save_database()
            print(f"\n[SUCCESS] Enrolled {name} ({roll_number}) successfully!")
            return True
        return False

    def enroll_from_folder(self, roll_number, name, folder_path, classroom_id=""):
        """Enrolls student from an existing directory of face pictures."""
        if not os.path.exists(folder_path):
            print(f"[ERROR] Directory does not exist: {folder_path}")
            return False

        valid_exts = [".jpg", ".jpeg", ".png", ".webp"]
        image_files = [f for f in os.listdir(folder_path) if os.path.splitext(f)[1].lower() in valid_exts]

        if not image_files:
            print(f"[ERROR] No valid image files found in {folder_path}")
            return False

        embeddings = []
        for img_name in image_files:
            img_path = os.path.join(folder_path, img_name)
            img = cv2.imread(img_path)
            if img is None:
                continue
            emb = self.compute_embedding(img)
            if emb is not None:
                embeddings.append(emb)

        if embeddings:
            avg_embedding = np.mean(embeddings, axis=0)
            avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-10)
            self.database[roll_number] = {
                "rollNumber": roll_number,
                "name": name,
                "classroom": classroom_id,
                "embedding": avg_embedding,
                "samples_count": len(embeddings)
            }
            self.save_database()
            print(f"[SUCCESS] Enrolled {name} ({roll_number}) from {len(embeddings)} images!")
            return True
        else:
            print("[ERROR] Could not extract embeddings from provided images.")
            return False

    def list_enrolled(self):
        print("\n=== Enrolled Students ===")
        if not self.database:
            print("No students enrolled yet.")
            return
        for roll, info in self.database.items():
            print(f"- Roll: {roll} | Name: {info.get('name')} | Samples: {info.get('samples_count', 0)}")
        print("=========================\n")


if __name__ == "__main__":
    enrollment = StudentEnrollmentSystem()
    while True:
        print("\n--- Smart Classroom Face Enrollment ---")
        print("1. Enroll Student via Webcam")
        print("2. Enroll Student from Image Folder")
        print("3. List Enrolled Students")
        print("4. Exit")
        choice = input("Enter choice (1-4): ").strip()

        if choice == "1":
            roll = input("Enter Student Roll Number: ").strip()
            name = input("Enter Student Full Name: ").strip()
            if roll and name:
                enrollment.enroll_via_webcam(roll, name)
            else:
                print("Roll number and name cannot be empty.")
        elif choice == "2":
            roll = input("Enter Student Roll Number: ").strip()
            name = input("Enter Student Full Name: ").strip()
            folder = input("Enter Folder Path containing student photos: ").strip()
            if roll and name and folder:
                enrollment.enroll_from_folder(roll, name, folder)
        elif choice == "3":
            enrollment.list_enrolled()
        elif choice == "4":
            print("Exiting enrollment system.")
            break
        else:
            print("Invalid choice. Please select 1-4.")
