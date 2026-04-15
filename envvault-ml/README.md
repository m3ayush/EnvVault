# EnvVault ML — Anomaly Detection for Secrets Manager

ML-powered anomaly detection for EnvVault audit logs using **Isolation Forest** and **MLflow**.

Detects suspicious secret access patterns (off-hours access, bulk reads, unusual IPs) and flags them in real-time via a Flask prediction API.

## Prerequisites

- **Python 3.10–3.12** (MLflow 2.13.0 is not compatible with Python 3.13+)
- pip

## Setup

```bash
cd envvault-ml

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Step-by-Step Usage

### 1. Start MLflow Server

Open a **separate terminal**, activate the venv, and start the tracking server:

```bash
cd envvault-ml
source .venv/bin/activate
mlflow server --host 0.0.0.0 --port 5050
```

Leave this running. Open http://localhost:5050 to access the MLflow UI.

### 2. Train Models

```bash
python train.py
```

This trains 3 Isolation Forest models with different hyperparameters and registers them in the MLflow Model Registry as `EnvVault-AnomalyDetector`.

### 3. Compare Runs in MLflow UI

Open http://localhost:5050 and navigate to the **envvault-anomaly-detection** experiment. Compare anomaly rates, scores, and parameters across all 3 runs.

### 4. Promote the Best Model

```bash
python promote_model.py
```

This finds the model version with the lowest anomaly rate and sets the `champion` alias on it.

### 5. Start the Prediction API

```bash
python app.py
```

The Flask API starts on http://localhost:8000.

### 6. Test Predictions

**Health check:**

```bash
curl http://localhost:8000/health
```

**Predict a suspicious event (should return anomaly):**

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "hour_of_day": 3,
    "secrets_per_session": 47,
    "user_role_encoded": 0,
    "ip_hash": 9,
    "action_type_encoded": 2,
    "day_of_week": 6
  }'
```

**Predict a normal event:**

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "hour_of_day": 10,
    "secrets_per_session": 3,
    "user_role_encoded": 1,
    "ip_hash": 2,
    "action_type_encoded": 0,
    "day_of_week": 2
  }'
```

**Batch prediction:**

```bash
curl -X POST http://localhost:8000/predict/batch \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {"hour_of_day": 10, "secrets_per_session": 3, "user_role_encoded": 1, "ip_hash": 2, "action_type_encoded": 0, "day_of_week": 2},
      {"hour_of_day": 2, "secrets_per_session": 50, "user_role_encoded": 0, "ip_hash": 9, "action_type_encoded": 2, "day_of_week": 6}
    ]
  }'
```

### 7. Retrain with Fresh Data

```bash
python retrain.py
```

This generates new data with slight distribution drift, trains a new model, registers it, and auto-promotes it to `champion`. Restart `app.py` afterward to serve the new model.

## Node.js Integration

Add this to your EnvVault backend to call the prediction API after every secret access event:

```javascript
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

async function checkAnomalyDetection(auditEvent) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict`, {
      hour_of_day: new Date().getHours(),
      secrets_per_session: auditEvent.secretsAccessedInSession,
      user_role_encoded: encodeRole(auditEvent.userRole), // 0=viewer, 1=developer, 2=admin
      ip_hash: hashIpBucket(auditEvent.ipAddress),        // Map IP to bucket 1-10
      action_type_encoded: encodeAction(auditEvent.action), // 0=read, 1=write, 2=delete
      day_of_week: new Date().getDay(),
    });

    const prediction = response.data;

    if (prediction.is_anomaly) {
      // Flag in database
      await AuditLog.findByIdAndUpdate(auditEvent._id, {
        is_anomaly: true,
        anomaly_score: prediction.anomaly_score,
        anomaly_confidence: prediction.confidence,
      });

      // Alert admin
      console.warn(`[ANOMALY DETECTED] User: ${auditEvent.userId}, ` +
        `Score: ${prediction.anomaly_score}, Confidence: ${prediction.confidence}`);

      // Optional: send notification to admin
      await notifyAdmin({
        type: 'anomaly_detected',
        userId: auditEvent.userId,
        action: auditEvent.action,
        score: prediction.anomaly_score,
        confidence: prediction.confidence,
        timestamp: new Date(),
      });
    }

    return prediction;
  } catch (error) {
    console.error('[ML Service] Prediction failed:', error.message);
    return null; // Fail open — don't block access if ML service is down
  }
}

function encodeRole(role) {
  const roles = { viewer: 0, developer: 1, admin: 2 };
  return roles[role] ?? 1;
}

function encodeAction(action) {
  const actions = { read: 0, write: 1, delete: 2 };
  return actions[action] ?? 0;
}

function hashIpBucket(ip) {
  // Simple hash to bucket 1-10
  const hash = ip.split('.').reduce((sum, octet) => sum + parseInt(octet), 0);
  return (hash % 10) + 1;
}
```

## Features Explained

| Feature | Description | Normal Range | Anomalous |
|---------|-------------|-------------|-----------|
| `hour_of_day` | Hour of access (0-23) | 8-18 (work hours) | 0-5 (late night) |
| `secrets_per_session` | Secrets accessed in session | 1-8 | 40-60 (bulk access) |
| `user_role_encoded` | User role (0/1/2) | Any | Any |
| `ip_hash` | Anonymized IP bucket (1-10) | 1-4 (office IPs) | 8-10 (unknown IPs) |
| `action_type_encoded` | Action type (0/1/2) | Any | Any |
| `day_of_week` | Day (0=Mon, 6=Sun) | 0-4 (weekdays) | 5-6 (weekends) |
