"""
EnvVault Anomaly Detection — Model Promotion Script
Finds the best model version (lowest anomaly_rate) in the MLflow Model Registry
and promotes it to the "champion" alias for production serving.
"""

import os
import sys
from mlflow import MlflowClient
from dotenv import load_dotenv

load_dotenv()

# ── CONFIGURATION ──────────────────────────────────────────────────────────────

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5050")
MODEL_NAME = "EnvVault-AnomalyDetector"

# ── FIND BEST VERSION ──────────────────────────────────────────────────────────

def find_best_version(client):
    """Find the model version with the lowest anomaly_rate metric."""
    print(f"[SEARCH] Fetching all versions of '{MODEL_NAME}'...")

    versions = client.search_model_versions(f"name='{MODEL_NAME}'")

    if not versions:
        print(f"[ERROR] No versions found for model '{MODEL_NAME}'.")
        print(f"[ERROR] Run train.py first to register model versions.")
        sys.exit(1)

    print(f"[SEARCH] Found {len(versions)} version(s)\n")

    best_version = None
    best_rate = float("inf")

    for v in versions:
        try:
            run = client.get_run(v.run_id)
            rate = run.data.metrics.get("anomaly_rate")

            if rate is None:
                print(f"  Version {v.version}: anomaly_rate metric missing — skipping")
                continue

            print(f"  Version {v.version}: anomaly_rate={rate:.4f}")

            if rate < best_rate:
                best_rate = rate
                best_version = v

        except Exception as e:
            print(f"  Version {v.version}: could not fetch run data — {e}")
            continue

    if best_version is None:
        print("[ERROR] No valid versions with anomaly_rate metric found.")
        sys.exit(1)

    return best_version, best_rate

# ── PROMOTE ────────────────────────────────────────────────────────────────────

def promote_version(client, version, anomaly_rate):
    """Set the champion alias and production tag on the best version."""
    version_num = version.version

    print(f"\n[PROMOTE] Promoting version {version_num} (anomaly_rate={anomaly_rate:.4f})...")

    # Set the "champion" alias
    client.set_registered_model_alias(MODEL_NAME, "champion", version_num)
    print(f"[PROMOTE] Alias 'champion' set on version {version_num}")

    # Tag the version as production
    client.set_model_version_tag(MODEL_NAME, version_num, "status", "production")
    print(f"[PROMOTE] Tag 'status=production' added to version {version_num}")

# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    print(f"[SETUP] Connecting to MLflow at {MLFLOW_TRACKING_URI}")
    client = MlflowClient(tracking_uri=MLFLOW_TRACKING_URI)

    best_version, best_rate = find_best_version(client)
    promote_version(client, best_version, best_rate)

    print(f"\n{'='*60}")
    print(f"[DONE] Version {best_version.version} is now the champion!")
    print(f"  Model: {MODEL_NAME}")
    print(f"  Anomaly rate: {best_rate:.4f}")
    print(f"  Alias: champion")
    print(f"{'='*60}")
    print(f"\nNext step: python app.py")


if __name__ == "__main__":
    main()
