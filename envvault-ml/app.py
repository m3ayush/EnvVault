"""
EnvVault Anomaly Detection - Flask Prediction API
Serves the IsolationForest model for real-time anomaly detection
on audit log events. Loads model.pkl directly (standalone) or
from MLflow Model Registry when available.
"""

import os
import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# -- CONFIGURATION -----------------------------------------------------------

PORT = int(os.getenv("ML_SERVICE_PORT", 8000))
MODEL_PKL_PATH = os.getenv("MODEL_PKL_PATH", os.path.join(os.path.dirname(__file__), "model.pkl"))

FEATURE_COLUMNS = [
    "hour_of_day",
    "secrets_per_session",
    "user_role_encoded",
    "ip_hash",
    "action_type_encoded",
    "day_of_week",
]

# Score range from training data (contamination=0.14, n_estimators=200)
TRAIN_MIN_SCORE = -0.0658
TRAIN_MAX_SCORE = 0.1139

# -- MODEL LOADING ------------------------------------------------------------

app = Flask(__name__)
CORS(app)
model = None


def load_model():
    """Load the trained model from local .pkl file or MLflow registry."""
    global model

    # Try loading from local .pkl file first (works without MLflow server)
    if os.path.exists(MODEL_PKL_PATH):
        print(f"[MODEL] Loading from {MODEL_PKL_PATH}...")
        model = joblib.load(MODEL_PKL_PATH)
        print("[MODEL] Loaded successfully from .pkl file")
        return

    # Fallback: try MLflow Model Registry
    try:
        import mlflow.sklearn
        mlflow_uri = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5050")
        model_name = "EnvVault-AnomalyDetector"
        model_uri = f"models:/{model_name}@champion"

        print(f"[MODEL] No .pkl found, trying MLflow at {mlflow_uri}...")
        mlflow.set_tracking_uri(mlflow_uri)
        model = mlflow.sklearn.load_model(model_uri)
        print("[MODEL] Loaded successfully from MLflow registry")
    except Exception as e:
        print(f"[ERROR] Could not load model from MLflow: {e}")
        print("[ERROR] Place a model.pkl in the ml-service directory or start MLflow")
        model = None


# -- HELPERS ------------------------------------------------------------------

def normalize_confidence(score):
    """Map raw decision_function score to 0-100% confidence."""
    if score < 0:
        pct = min(abs(score) / abs(TRAIN_MIN_SCORE), 1.0)
    else:
        pct = min(score / TRAIN_MAX_SCORE, 1.0)
    return round(pct * 100, 1)


def classify_confidence(pct):
    """Map confidence percentage to level string."""
    if pct > 70:
        return "high"
    elif pct > 40:
        return "medium"
    return "low"


def validate_event(event):
    """Check that all required feature fields are present."""
    return [col for col in FEATURE_COLUMNS if col not in event]


def predict_single(event):
    """Run prediction on a single audit log event."""
    df = pd.DataFrame([event], columns=FEATURE_COLUMNS)
    score = float(model.decision_function(df)[0])
    prediction = int(model.predict(df)[0])
    is_anomaly = prediction == -1

    confidence_pct = normalize_confidence(score)
    confidence_level = classify_confidence(confidence_pct)

    return {
        "anomaly_score": round(score, 6),
        "is_anomaly": is_anomaly,
        "confidence": confidence_level,
        "confidence_pct": confidence_pct,
        "label": "anomaly" if is_anomaly else "normal",
    }


# -- ENDPOINTS ----------------------------------------------------------------

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "envvault-ml",
        "version": "1.0.0",
        "model_loaded": model is not None,
        "endpoints": ["/health", "/predict", "/predict/batch"],
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "service": "envvault-ml",
        "status": "healthy" if model is not None else "no model loaded",
        "model_loaded": model is not None,
    })


@app.route("/predict", methods=["POST"])
def predict():
    """Predict anomaly for a single audit log event."""
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    missing = validate_event(data)
    if missing:
        return jsonify({"error": "Missing required fields", "missing_fields": missing}), 400

    result = predict_single(data)
    return jsonify(result)


@app.route("/predict/batch", methods=["POST"])
def predict_batch():
    """Predict anomalies for a batch of audit log events."""
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    data = request.get_json()
    if not data or "events" not in data:
        return jsonify({"error": "Request body must contain 'events' list"}), 400

    events = data["events"]
    if not isinstance(events, list) or len(events) == 0:
        return jsonify({"error": "'events' must be a non-empty list"}), 400

    for i, event in enumerate(events):
        missing = validate_event(event)
        if missing:
            return jsonify({"error": f"Event at index {i} missing fields", "missing_fields": missing}), 400

    df = pd.DataFrame(events, columns=FEATURE_COLUMNS)
    scores = model.decision_function(df)
    predictions = model.predict(df)

    results = []
    for i in range(len(events)):
        score = float(scores[i])
        is_anomaly = int(predictions[i]) == -1
        confidence_pct = normalize_confidence(score)
        results.append({
            "anomaly_score": round(score, 6),
            "is_anomaly": is_anomaly,
            "confidence": classify_confidence(confidence_pct),
            "confidence_pct": confidence_pct,
            "label": "anomaly" if is_anomaly else "normal",
        })

    anomaly_count = sum(1 for r in results if r["is_anomaly"])
    return jsonify({
        "predictions": results,
        "summary": {"total": len(results), "anomalies": anomaly_count, "normal": len(results) - anomaly_count},
    })


# -- MAIN ---------------------------------------------------------------------

# Load model at import time (works for both gunicorn and direct run)
load_model()

if __name__ == "__main__":
    print(f"[SERVER] EnvVault ML Service on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
