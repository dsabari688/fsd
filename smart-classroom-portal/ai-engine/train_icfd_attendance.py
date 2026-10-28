"""
ICFD Attendance Model Training & Validation Script
Enrolls students from Indian Classroom Face Dataset (ICFD_Samples/Gallery)
and validates recognition performance on unseen test images (ICFD_Samples/Probe).
Saves the trained facial identity database to 'face_database.pkl'.
"""

import os
import sys
import pickle
import time
import numpy as np
import torch
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1

def get_icfd_dirs():
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ICFD_Samples", "ICFD_Samples")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ICFD_Samples")),
        r"D:\smaart class room\ICFD_Samples\ICFD_Samples",
        r"D:\smaart class room\ICFD_Samples"
    ]
    for c in candidates:
        gallery = os.path.join(c, "Gallery")
        probe = os.path.join(c, "Probe")
        if os.path.isdir(gallery) and os.path.isdir(probe):
            return gallery, probe
    return None, None

def train_and_evaluate_attendance():
    print("=" * 65)
    print(" ICFD Face Attendance Model Training & Evaluation Pipeline")
    print("=" * 65)

    gallery_dir, probe_dir = get_icfd_dirs()
    if not gallery_dir:
        print("[ERROR] Could not find ICFD Gallery and Probe directories.")
        sys.exit(1)

    print(f"[*] Training (Gallery) path:   {gallery_dir}")
    print(f"[*] Evaluation (Probe) path:   {probe_dir}")

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"[*] Processing device:         {device}")

    # Initialize MTCNN & InceptionResnetV1 (FaceNet)
    print("[*] Initializing FaceNet (InceptionResnetV1 pretrained on VGGFace2)...")
    mtcnn = MTCNN(image_size=160, margin=14, keep_all=False, device=device)
    resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

    # 1. Training Phase: Extract Embeddings from Gallery
    print("\n" + "=" * 65)
    print(" STEP 1: Enrolling Students from Gallery (Training)")
    print("=" * 65)

    database = {}
    subject_dirs = sorted([d for d in os.listdir(gallery_dir) if os.path.isdir(os.path.join(gallery_dir, d))])
    print(f"Found {len(subject_dirs)} student subjects: {', '.join(subject_dirs)}\n")

    t_start = time.time()
    for subj in subject_dirs:
        subj_gallery = os.path.join(gallery_dir, subj)
        img_files = [f for f in os.listdir(subj_gallery) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        
        embeddings = []
        for img_name in img_files:
            img_path = os.path.join(subj_gallery, img_name)
            try:
                pil_img = Image.open(img_path).convert("RGB")
                face_tensor = mtcnn(pil_img)
                if face_tensor is not None:
                    face_tensor = face_tensor.unsqueeze(0).to(device)
                    with torch.no_grad():
                        emb = resnet(face_tensor)
                    emb_np = emb.squeeze().cpu().numpy()
                    norm = np.linalg.norm(emb_np)
                    if norm > 0:
                        embeddings.append(emb_np / norm)
            except Exception as e:
                pass

        if embeddings:
            avg_emb = np.mean(embeddings, axis=0)
            avg_emb = avg_emb / (np.linalg.norm(avg_emb) + 1e-10)
            roll_number = f"STU-{int(subj):02d}"
            student_name = f"Student {int(subj):02d}"
            
            database[roll_number] = {
                "rollNumber": roll_number,
                "name": student_name,
                "subjectId": subj,
                "embedding": avg_emb,
                "embeddings": embeddings,
                "samples_count": len(embeddings)
            }
            print(f"  [+] Enrolled {student_name} ({roll_number}): {len(embeddings)}/{len(img_files)} valid face embeddings")
        else:
            print(f"  [-] Failed to extract faces for Subject {subj}")

    # Save face database to face_database.pkl
    out_db_path = os.path.join(os.path.dirname(__file__), "face_database.pkl")
    with open(out_db_path, "wb") as f:
        pickle.dump(database, f)
    
    print(f"\n[*] Successfully saved trained face database to:")
    print(f"    -> {out_db_path}")
    print(f"    -> Total enrolled students: {len(database)}")

    # 2. Validation / Evaluation Phase on Probe set
    print("\n" + "=" * 65)
    print(" STEP 2: Evaluating Recognition Accuracy on Probe (Unseen Test Set)")
    print("=" * 65)

    total_probes = 0
    correct_probes = 0
    per_student_results = {}

    for subj in subject_dirs:
        subj_probe = os.path.join(probe_dir, subj)
        if not os.path.isdir(subj_probe):
            continue
        
        img_files = [f for f in os.listdir(subj_probe) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        expected_roll = f"STU-{int(subj):02d}"
        
        subj_correct = 0
        subj_total = 0
        similarities = []

        for img_name in img_files:
            img_path = os.path.join(subj_probe, img_name)
            try:
                pil_img = Image.open(img_path).convert("RGB")
                face_tensor = mtcnn(pil_img)
                if face_tensor is None:
                    continue

                face_tensor = face_tensor.unsqueeze(0).to(device)
                with torch.no_grad():
                    emb = resnet(face_tensor)
                emb_np = emb.squeeze().cpu().numpy()
                norm = np.linalg.norm(emb_np)
                if norm == 0:
                    continue
                emb_np = emb_np / norm

                # Cosine similarity matching
                best_sim = -1.0
                best_roll = None
                for roll, data in database.items():
                    sim = float(np.dot(emb_np, data["embedding"]))
                    if sim > best_sim:
                        best_sim = sim
                        best_roll = roll

                subj_total += 1
                total_probes += 1
                similarities.append(best_sim)

                if best_roll == expected_roll and best_sim >= 0.50:
                    subj_correct += 1
                    correct_probes += 1

            except Exception as e:
                pass

        acc = (subj_correct / subj_total * 100) if subj_total > 0 else 0.0
        avg_sim = np.mean(similarities) if similarities else 0.0
        per_student_results[subj] = {
            "tested": subj_total,
            "correct": subj_correct,
            "acc": acc,
            "avg_sim": avg_sim
        }

    # Print Evaluation Report
    print(f"\n{'Subject':<12} | {'Enrolled (Train)':<16} | {'Probe (Test)':<12} | {'Correct':<8} | {'Accuracy':<10} | {'Avg Sim'}")
    print("-" * 75)
    for subj, res in per_student_results.items():
        roll = f"STU-{int(subj):02d}"
        enrolled = database.get(roll, {}).get("samples_count", 0)
        print(f"Student {int(subj):02d}  | {enrolled:<16} | {res['tested']:<12} | {res['correct']:<8} | {res['acc']:>6.1f}%    | {res['avg_sim']:.4f}")

    overall_acc = (correct_probes / total_probes * 100) if total_probes > 0 else 0.0
    print("-" * 75)
    print(f"OVERALL EVALUATION ACCURACY: {overall_acc:.2f}% ({correct_probes}/{total_probes} correct matches)")
    print(f"Elapsed Time: {time.time() - t_start:.2f}s")
    print("=" * 65)

if __name__ == "__main__":
    train_and_evaluate_attendance()
