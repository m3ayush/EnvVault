"""
EnvVault Anomaly Detection — Retraining Script
Generates fresh audit log data with slight drift, trains a new IsolationForest
pipeline, registers it in MLflow, and auto-promotes to champion.
"""

import os
import time
from datetime import datetime

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow import MlflowClient
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest
from dotenv import load_dotenv

load_dotenv()

# ── CONFIGURATION ──────────────────────────────────────────────────────────────

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5050")
EXPERIMENT_NAME = "envvault-anomaly-detection"
MODEL_NAME = "EnvVault-AnomalyDetector"

FEATURE_COLUMNS = [
    "hour_of_day",
    "secrets_per_session",
    "user_role_encoded",
    "ip_hash",
    "action_type_encoded",
    "day_of_week",
]

# ── DATA GENERATION (WITH DRIFT) ──────────────────────────────────────────────

def load_fresh_audit_logs(n_normal=350, n_anomaly=50):
    """Generate fresh audit log data with slight random drift.

    Simulates real-world data shift where access patterns evolve over time:
    - Work hours slightly wider (7-20 instead of 8-18)
    - Secrets per session slightly higher (1-12 instead of 1-8)
    - IP range slightly broader
    """
    np.random.seed(int(time.time()) % 2**31)

    # Normal records with drifted ranges
    normal = pd.DataFrame({
        "hour_of_day":        np.random.randint(7, 20, size=n_normal),
        "secrets_per_session": np.random.randint(1, 13, size=n_normal),
        "user_role_encoded":  np.random.choice([0, 1, 2], size=n_normal),
        "ip_hash":            np.random.randint(1, 6, size=n_normal),
        "action_type_encoded": np.random.choice([0, 1, 2], size=n_normal),
        "day_of_week":        np.random.randint(0, 5, size=n_normal),
    })

    # Anomaly records
    anomaly = pd.DataFrame({
        "hour_of_day":        np.random.randint(0, 6, size=n_anomaly),
        "secrets_per_session": np.random.randint(40, 61, size=n_anomaly),
        "user_role_encoded":  np.random.choice([0, 1, 2], size=n_anomaly),
        "ip_hash":            np.random.randint(8, 11, size=n_anomaly),
        "action_type_encoded": np.random.choice([0, 1, 2], size=n_anomaly),
        "day_of_week":        np.random.choice([5, 6], size=n_anomaly),
    })

    data = pd.concat([normal, anomaly], ignore_index=True)
    print(f"[DATA] Generated {n_normal} normal + {n_anomaly} anomaly = {len(data)} records (with drift)")
    return data

# ── RETRAIN ────────────────────────────────────────────────────────────────────

def retrain():
    """Train a new model on fresh data and register it."""
    today = datetime.now().strftime("%Y-%m-%d")
    run_name = f"retrain-{today}"

    print(f"[SETUP] Connecting to MLflow at {MLFLOW_TRACKING_URI}")
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(EXPERIMENT_NAME)

    # Generate fresh data
    data = load_fresh_audit_logs()

    print(f"\n[TRAIN] Starting retraining run: {run_name}")
    print(f"[TRAIN] n_estimators=150, contamination=0.05")

    with mlflow.start_run(run_name=run_name):
        # Build and train pipeline
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("isolation_forest", IsolationForest(
                contamination=0.05,
                n_estimators=150,
                random_state=42,
            )),
        ])
        pipeline.fit(data)

        # Compute predictions and scores
        predictions = pipeline.predict(data)
        scores = pipeline.decision_function(data)

        anomaly_count = int((predictions == -1).sum())
        total_records = len(data)
        anomaly_rate = anomaly_count / total_records

        # Log parameters
        mlflow.log_param("contamination", 0.05)
        mlflow.log_param("n_estimators", 150)
        mlflow.log_param("model_type", "IsolationForest")
        mlflow.log_param("scaler", "StandardScaler")
        mlflow.log_param("retrain_date", today)
        mlflow.log_param("data_size", total_records)

        # Log metrics
        mlflow.log_metric("anomaly_count", anomaly_count)
        mlflow.log_metric("anomaly_rate", anomaly_rate)
        mlflow.log_metric("mean_score", float(np.mean(scores)))
        mlflow.log_metric("min_score", float(np.min(scores)))
        mlflow.log_metric("max_score", float(np.max(scores)))
        mlflow.log_metric("total_records", total_records)

        # Register model
        mlflow.sklearn.log_model(
            pipeline,
            artifact_path="model",
            registered_model_name=MODEL_NAME,
        )

        print(f"[RESULT] Anomalies detected: {anomaly_count}/{total_records} ({anomaly_rate:.2%})")
        print(f"[RESULT] Scores — mean: {np.mean(scores):.4f}, min: {np.min(scores):.4f}, max: {np.max(scores):.4f}")

    return today

# ── AUTO-PROMOTE ───────────────────────────────────────────────────────────────

def auto_promote(retrain_date):
    """Promote the latest registered version to champion."""
    client = MlflowClient(tracking_uri=MLFLOW_TRACKING_URI)

    print(f"\n[PROMOTE] Finding latest model version...")
    versions = client.search_model_versions(f"name='{MODEL_NAME}'")

    if not versions:
        print("[ERROR] No model versions found after retraining.")
        return

    # Find latest version by version number
    latest = max(versions, key=lambda v: int(v.version))
    version_num = latest.version

    # Set champion alias
    client.set_registered_model_alias(MODEL_NAME, "champion", version_num)
    print(f"[PROMOTE] Alias 'champion' set on version {version_num}")

    # Tag with retrain date
    client.set_model_version_tag(MODEL_NAME, version_num, "retrained_on", retrain_date)
    client.set_model_version_tag(MODEL_NAME, version_num, "status", "production")
    print(f"[PROMOTE] Tagged version {version_num} with retrained_on={retrain_date}")

    return version_num

# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("[RETRAIN] EnvVault Anomaly Detection — Retraining")
    print("=" * 60)

    retrain_date = retrain()
    new_version = auto_promote(retrain_date)

    print(f"\n{'='*60}")
    print(f"[DONE] Retraining complete!")
    print(f"  Model: {MODEL_NAME}")
    print(f"  New version: {new_version}")
    print(f"  Alias: champion")
    print(f"  Retrained on: {retrain_date}")
    print(f"{'='*60}")
    print(f"\nRestart the Flask API to serve the new model:")
    print(f"  python app.py")


if __name__ == "__main__":
    main()
