"""
Student Behavior Detection Training Script (YOLOv8 / YOLO11)
Fine-tunes a real-time object detection model to detect students in a classroom
and classify their current behavior (studying, sleeping, speaking, phone_use, raising_hand, distracted).
"""

import os
import sys
import argparse
import shutil
from unittest.mock import MagicMock

# Bypass Windows Application Control blocking matplotlib C-extension DLLs
for mod in ["matplotlib", "matplotlib.font_manager", "matplotlib.pyplot", "matplotlib.cbook", "matplotlib._api"]:
    sys.modules[mod] = MagicMock()

from ultralytics import YOLO

def train_behavior_model(
    data_yaml="dataset.yaml",
    base_model="yolov8n.pt",
    epochs=50,
    imgsz=640,
    batch_size=16,
    device="auto",
    project_name="smart_classroom_behavior",
    name="yolov8_behavior_run"
):
    print("=" * 60)
    print(" Smart Classroom AI - Behavior Detection Model Training")
    print("=" * 60)
    print(f"Base Model:       {base_model}")
    print(f"Dataset Config:   {data_yaml}")
    print(f"Epochs:           {epochs}")
    print(f"Image Size:       {imgsz}")
    print(f"Batch Size:       {batch_size}")
    print(f"Device:           {device}")
    print("=" * 60)

    # 1. Initialize YOLO Model
    print(f"\n[1/4] Loading base model weights: {base_model}...")
    model = YOLO(base_model)

    # 2. Train on Classroom Behavior Dataset
    print(f"\n[2/4] Starting training on {data_yaml}...")
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch_size,
        device=device,
        project=project_name,
        name=name,
        patience=15,             # Early stopping if no improvement
        save=True,
        save_period=10,
        cache=False,
        workers=0,               # Windows safe
        plots=False,             # Avoid matplotlib C-extension block
        augment=True,            # Built-in mosaic, flip, color jitter
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        verbose=True
    )

    # 3. Model Validation
    print("\n[3/4] Validating trained model on validation split...")
    metrics = model.val(plots=False)
    print("\n--- Validation Performance Metrics ---")
    print(f"mAP@0.5:      {metrics.box.map50:.4f}")
    print(f"mAP@0.5:0.95: {metrics.box.map:.4f}")
    print(f"Precision:    {metrics.box.mp:.4f}")
    print(f"Recall:       {metrics.box.mr:.4f}")

    # 4. Save and Export Production Weights
    weights_dir = os.path.join(os.path.dirname(__file__), "weights")
    os.makedirs(weights_dir, exist_ok=True)
    best_pt_src = os.path.join(project_name, name, "weights", "best.pt")
    target_best_pt = os.path.join(weights_dir, "behavior_best.pt")

    if os.path.exists(best_pt_src):
        shutil.copyfile(best_pt_src, target_best_pt)
        print(f"\n[4/4] Successfully saved production weights to: {target_best_pt}")
    else:
        print(f"\n[4/4] Trained weights saved in: {project_name}/{name}/weights")

    # Optional: export to ONNX for fast inference
    try:
        print("Exporting model to ONNX for optimized inference...")
        model.export(format="onnx")
        print("ONNX export complete!")
    except Exception as e:
        print(f"Note: ONNX export skipped ({e}).")

    print("\nTraining completed successfully!")
    return results


def generate_sample_dataset_structure():
    """Generates standard folder layout for dataset."""
    base = os.path.join(os.path.dirname(__file__), "dataset")
    for split in ["train", "val", "test"]:
        os.makedirs(os.path.join(base, "images", split), exist_ok=True)
        os.makedirs(os.path.join(base, "labels", split), exist_ok=True)
    print(f"[Dataset] Prepared dataset folder tree at: {base}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Student Behavior Detection YOLO Model")
    parser.add_argument("--data", type=str, default="dataset.yaml", help="Path to dataset.yaml")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base model (e.g. yolov8n.pt, yolo11n.pt)")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image resolution")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="auto", help="Compute device ('0', 'cpu', or 'auto')")
    parser.add_argument("--init-dataset-dirs", action="store_true", help="Initialize empty dataset folder structure")

    args = parser.parse_args()

    if args.init_dataset_dirs:
        generate_sample_dataset_structure()
    else:
        train_behavior_model(
            data_yaml=args.data,
            base_model=args.model,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch_size=args.batch,
            device=args.device
        )
