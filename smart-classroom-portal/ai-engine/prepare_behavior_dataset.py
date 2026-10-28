"""
Prepares the Classroom Behavior Dataset for YOLOv8 Training.
Synthesizes and formats classroom behavior training & validation sets
using real student features from ICFD_Samples across all 6 target behavior classes:
0: studying
1: sleeping
2: speaking
3: phone_use
4: raising_hand
5: distracted
"""

import os
import glob
import random
import numpy as np
import cv2

DATASET_ROOT = os.path.join(os.path.dirname(__file__), "dataset")
ICFD_PATH = r"D:\smaart class room\ICFD_Samples\ICFD_Samples\Gallery"

def create_dataset():
    print("[1/3] Setting up dataset folders...")
    for split in ["train", "val"]:
        os.makedirs(os.path.join(DATASET_ROOT, "images", split), exist_ok=True)
        os.makedirs(os.path.join(DATASET_ROOT, "labels", split), exist_ok=True)

    # Collect student photos from ICFD
    student_photos = glob.glob(os.path.join(ICFD_PATH, "*", "*.jpg"))
    print(f"[*] Found {len(student_photos)} real student reference photos in ICFD.")

    classes = {
        0: "studying",
        1: "sleeping",
        2: "speaking",
        3: "phone_use",
        4: "raising_hand",
        5: "distracted"
    }

    # Generate train and val samples
    random.seed(42)
    np.random.seed(42)

    def generate_split(split, num_samples):
        print(f"[2/3] Generating {num_samples} samples for {split} split...")
        for i in range(num_samples):
            cls_id = i % len(classes)
            
            # Base classroom desk background
            canvas = np.ones((640, 640, 3), dtype=np.uint8)
            # Classroom wall / lighting variation
            wall_color = (random.randint(210, 245), random.randint(215, 245), random.randint(220, 250))
            canvas[:, :] = wall_color

            # Desk surface
            desk_color = (random.randint(90, 140), random.randint(70, 110), random.randint(50, 80))
            cv2.rectangle(canvas, (40, 360), (600, 620), desk_color, -1)
            cv2.line(canvas, (40, 360), (600, 360), (40, 30, 20), 3)

            # Insert real student head/face if available
            head_center = (320, 240)
            head_radius = 65

            if student_photos:
                photo_path = random.choice(student_photos)
                s_img = cv2.imread(photo_path)
                if s_img is not None:
                    s_resized = cv2.resize(s_img, (130, 150))
                    # Apply behavior-specific visual modification
                    if cls_id == 1:  # sleeping: head resting on desk
                        head_center = (320, 350)
                        s_resized = cv2.rotate(s_resized, cv2.ROTATE_90_CLOCKWISE)
                    elif cls_id == 2: # speaking: head turned
                        s_resized = cv2.flip(s_resized, 1)

                    sh, sw, _ = s_resized.shape
                    y1 = max(0, head_center[1] - sh // 2)
                    y2 = min(640, y1 + sh)
                    x1 = max(0, head_center[0] - sw // 2)
                    x2 = min(640, x1 + sw)
                    
                    canvas[y1:y2, x1:x2] = s_resized[:(y2-y1), :(x2-x1)]

            # Student torso
            torso_color = (random.randint(60, 180), random.randint(80, 160), random.randint(140, 220))
            cv2.rectangle(canvas, (210, 320), (430, 560), torso_color, -1)

            # Behavior specific visual props:
            if cls_id == 0:  # studying: open notebook on desk
                cv2.rectangle(canvas, (250, 400), (390, 480), (240, 240, 240), -1)
                cv2.rectangle(canvas, (250, 400), (390, 480), (100, 100, 100), 2)
            elif cls_id == 3:  # phone_use: smartphone
                cv2.rectangle(canvas, (280, 370), (360, 450), (20, 20, 20), -1)
                cv2.rectangle(canvas, (285, 375), (355, 445), (180, 200, 220), -1)
            elif cls_id == 4:  # raising_hand: raised arm
                cv2.rectangle(canvas, (370, 100), (420, 330), torso_color, -1)
                cv2.circle(canvas, (395, 90), 22, (200, 160, 140), -1)
            elif cls_id == 5:  # distracted: turned away
                cv2.arrowedLine(canvas, (320, 240), (460, 220), (0, 140, 255), 3)

            # Compute student bounding box (normalized YOLO coordinates)
            if cls_id == 4: # raising hand is taller
                bx, by, bw, bh = 0.50, 0.44, 0.58, 0.78
            elif cls_id == 1: # sleeping is lower
                bx, by, bw, bh = 0.50, 0.60, 0.60, 0.50
            else:
                bx, by, bw, bh = 0.50, 0.52, 0.55, 0.65

            img_filename = f"sample_{cls_id}_{i:03d}.jpg"
            lbl_filename = f"sample_{cls_id}_{i:03d}.txt"

            img_path = os.path.join(DATASET_ROOT, "images", split, img_filename)
            lbl_path = os.path.join(DATASET_ROOT, "labels", split, lbl_filename)

            cv2.imwrite(img_path, canvas)
            with open(lbl_path, "w") as f:
                f.write(f"{cls_id} {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}\n")

    generate_split("train", 60)
    generate_split("val", 18)

    # Update dataset.yaml
    yaml_path = os.path.join(os.path.dirname(__file__), "dataset.yaml")
    clean_path = DATASET_ROOT.replace("\\", "/")
    yaml_content = f"""# Ultralytics YOLOv8 Behavior Dataset Configuration
path: {clean_path}
train: images/train
val: images/val

nc: 6
names:
  0: studying
  1: sleeping
  2: speaking
  3: phone_use
  4: raising_hand
  5: distracted
"""
    with open(yaml_path, "w") as f:
        f.write(yaml_content)

    print(f"[3/3] Updated {yaml_path}")
    print("[SUCCESS] Classroom behavior dataset created successfully!")

if __name__ == "__main__":
    create_dataset()
