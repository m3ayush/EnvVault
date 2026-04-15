"""
Export the champion IsolationForest model from MLflow artifacts to a standalone .pkl file
for deployment to Hugging Face Spaces.
"""

import shutil
import os

# Champion model artifact path (version-3, the current champion)
CHAMPION_PKL = os.path.join(
    os.path.dirname(__file__),
    "mlartifacts",
    "943100508566929906",
    "008cfe71e218489485a1f2456be488c0",
    "artifacts",
    "model",
    "model.pkl",
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "huggingface")
OUTPUT_PKL = os.path.join(OUTPUT_DIR, "model.pkl")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(CHAMPION_PKL):
        print(f"[ERROR] Champion model not found at: {CHAMPION_PKL}")
        print("Make sure you have trained models (python train.py) first.")
        return

    shutil.copy2(CHAMPION_PKL, OUTPUT_PKL)
    print(f"Model exported to {OUTPUT_PKL}")
    print(f"Size: {os.path.getsize(OUTPUT_PKL) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
