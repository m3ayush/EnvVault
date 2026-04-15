"""
EnvVault Anomaly Detection — Model Training Script
Trains multiple IsolationForest models with different hyperparameters,
logs experiments to MLflow, and registers models to the Model Registry.
"""

import os
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
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

# ── DATA GENERATION ────────────────────────────────────────────────────────────

def load_audit_logs(n_normal=300, n_anomaly=50, seed=42):
    """Generate synthetic audit log data for training.

    Normal records simulate typical work-hours access patterns.
    Anomaly records simulate suspicious off-hours bulk access.
    """
    np.random.seed(seed)

    # Normal records — typical work-hours access
    normal = pd.DataFrame({
        "hour_of_day":        np.random.randint(8, 19, size=n_normal),
        "secrets_per_session": np.random.randint(1, 9, size=n_normal),
        "user_role_encoded":  np.random.choice([0, 1], size=n_normal),      # admin or dev only
        "ip_hash":            np.random.randint(1, 5, size=n_normal),
        "action_type_encoded": np.random.choice([0, 1], size=n_normal),     # read or write only
        "day_of_week":        np.random.randint(0, 5, size=n_normal),
    })

    # Anomaly records — suspicious off-hours bulk access from unknown IPs
    anomaly = pd.DataFrame({
        "hour_of_day":        np.random.randint(0, 6, size=n_anomaly),
        "secrets_per_session": np.random.randint(50, 101, size=n_anomaly),  # extreme bulk access
        "user_role_encoded":  np.full(n_anomaly, 2),                        # viewer doing bulk ops
        "ip_hash":            np.random.randint(8, 11, size=n_anomaly),     # unknown IP
        "action_type_encoded": np.full(n_anomaly, 2),                       # delete actions
        "day_of_week":        np.random.choice([5, 6], size=n_anomaly),     # weekend
    })

    # Labels for evaluation (not used in training — IsolationForest is unsupervised)
    labels = np.array([0] * n_normal + [1] * n_anomaly)  # 0=normal, 1=anomaly

    data = pd.concat([normal, anomaly], ignore_index=True)
    print(f"[DATA] Generated {n_normal} normal + {n_anomaly} anomaly = {len(data)} total records")
    return data, labels

# ── TRAINING ───────────────────────────────────────────────────────────────────

def build_pipeline(contamination=0.05, n_estimators=100):
    """Build a sklearn Pipeline with StandardScaler + IsolationForest."""
    return Pipeline([
        ("scaler", StandardScaler()),
        ("isolation_forest", IsolationForest(
            contamination=contamination,
            n_estimators=n_estimators,
            random_state=42,
        )),
    ])


def train_and_log(data, run_name, contamination, n_estimators):
    """Train one model, log params/metrics/model to MLflow."""
    print(f"\n{'='*60}")
    print(f"[TRAIN] Starting run: {run_name}")
    print(f"[TRAIN] contamination={contamination}, n_estimators={n_estimators}")
    print(f"{'='*60}")

    with mlflow.start_run(run_name=run_name):
        # Build and fit pipeline
        pipeline = build_pipeline(contamination=contamination, n_estimators=n_estimators)
        pipeline.fit(data)

        # Predictions and scores
        predictions = pipeline.predict(data)       # -1 = anomaly, 1 = normal
        scores = pipeline.decision_function(data)   # lower = more anomalous

        anomaly_count = int((predictions == -1).sum())
        total_records = len(data)
        anomaly_rate = anomaly_count / total_records

        # Log parameters
        mlflow.log_param("contamination", contamination)
        mlflow.log_param("n_estimators", n_estimators)
        mlflow.log_param("model_type", "IsolationForest")
        mlflow.log_param("scaler", "StandardScaler")

        # Log metrics
        mlflow.log_metric("anomaly_count", anomaly_count)
        mlflow.log_metric("anomaly_rate", anomaly_rate)
        mlflow.log_metric("mean_score", float(np.mean(scores)))
        mlflow.log_metric("min_score", float(np.min(scores)))
        mlflow.log_metric("max_score", float(np.max(scores)))
        mlflow.log_metric("total_records", total_records)

        # Log and register model
        mlflow.sklearn.log_model(
            pipeline,
            artifact_path="model",
            registered_model_name=MODEL_NAME,
        )

        # Print summary
        print(f"[RESULT] Run: {run_name}")
        print(f"  Anomalies detected: {anomaly_count}/{total_records} ({anomaly_rate:.2%})")
        print(f"  Scores — mean: {np.mean(scores):.4f}, min: {np.min(scores):.4f}, max: {np.max(scores):.4f}")
        print(f"[RESULT] Model registered as '{MODEL_NAME}'")

    return anomaly_rate

# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    print("[SETUP] Configuring MLflow...")
    print(f"[SETUP] Tracking URI: {MLFLOW_TRACKING_URI}")

    try:
        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        mlflow.set_experiment(EXPERIMENT_NAME)
    except Exception as e:
        print(f"[ERROR] Could not connect to MLflow at {MLFLOW_TRACKING_URI}")
        print(f"[ERROR] Make sure the MLflow server is running:")
        print(f"        mlflow server --host 0.0.0.0 --port 5050")
        raise SystemExit(1) from e

    print(f"[SETUP] Experiment: {EXPERIMENT_NAME}\n")

    # Generate training data
    data, labels = load_audit_logs()

    # Define experiment runs
    runs = [
        {"name": "baseline-v1",              "contamination": 0.05, "n_estimators": 100},
        {"name": "higher-contamination-v2",   "contamination": 0.14, "n_estimators": 100},
        {"name": "more-trees-v3",             "contamination": 0.14, "n_estimators": 200},
    ]

    results = []
    for run_config in runs:
        rate = train_and_log(
            data,
            run_name=run_config["name"],
            contamination=run_config["contamination"],
            n_estimators=run_config["n_estimators"],
        )
        results.append((run_config["name"], rate))

    # Final summary
    print(f"\n{'='*60}")
    print("[DONE] All training runs complete!")
    print(f"{'='*60}")
    for name, rate in results:
        print(f"  {name}: anomaly_rate={rate:.2%}")
    print(f"\nView experiments at: {MLFLOW_TRACKING_URI}")
    print(f"Next step: python promote_model.py")


if __name__ == "__main__":
    main()
