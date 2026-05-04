"""
Unit & Integration Tests: EnvVault ML Prediction API
Tests health endpoint, predict endpoint (normal & anomaly),
batch prediction, input validation, and edge cases.
"""

import json
import pytest
import sys
import os

# Add parent directory to path so we can import app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import app, model, normalize_confidence, classify_confidence, validate_event


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


# ── Health & Info Endpoints ──────────────────────────────────────────────────

class TestHealthEndpoints:
    def test_root_returns_service_info(self, client):
        response = client.get('/')
        data = json.loads(response.data)
        assert response.status_code == 200
        assert data['service'] == 'envvault-ml'
        assert data['version'] == '1.0.0'
        assert '/health' in data['endpoints']
        assert '/predict' in data['endpoints']

    def test_health_returns_model_status(self, client):
        response = client.get('/health')
        data = json.loads(response.data)
        assert response.status_code == 200
        assert data['service'] == 'envvault-ml'
        assert 'model_loaded' in data
        assert 'status' in data

    def test_health_reports_model_loaded(self, client):
        """Model should be loaded from model.pkl during app startup."""
        response = client.get('/health')
        data = json.loads(response.data)
        assert data['model_loaded'] is True
        assert data['status'] == 'healthy'


# ── Prediction Endpoint ─────────────────────────────────────────────────────

class TestPredictEndpoint:
    def test_normal_behavior_detected_as_normal(self, client):
        """Normal work-hours access should be classified as normal."""
        payload = {
            "hour_of_day": 10,
            "secrets_per_session": 3,
            "user_role_encoded": 1,  # developer
            "ip_hash": 2,           # known IP
            "action_type_encoded": 0,  # read
            "day_of_week": 2         # Tuesday
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 200
        assert data['is_anomaly'] is False
        assert data['label'] == 'normal'
        assert 'anomaly_score' in data
        assert 'confidence' in data
        assert 'confidence_pct' in data

    def test_anomalous_behavior_detected(self, client):
        """Bulk access at 3 AM by viewer should be flagged as anomaly."""
        payload = {
            "hour_of_day": 3,
            "secrets_per_session": 75,
            "user_role_encoded": 2,  # viewer
            "ip_hash": 9,           # unknown IP
            "action_type_encoded": 2,  # delete
            "day_of_week": 6         # Sunday
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 200
        assert data['is_anomaly'] is True
        assert data['label'] == 'anomaly'

    def test_missing_fields_returns_400(self, client):
        """Request with missing required fields should fail with 400."""
        payload = {
            "hour_of_day": 10,
            # missing all other fields
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 400
        assert 'missing_fields' in data

    def test_empty_body_returns_400(self, client):
        """Request with no body should fail."""
        response = client.post('/predict',
                               data='',
                               content_type='application/json')
        # Flask may return 400 or 415 for empty/invalid JSON
        assert response.status_code in [400, 415]

    def test_prediction_response_has_all_fields(self, client):
        """Response should contain all expected fields."""
        payload = {
            "hour_of_day": 14,
            "secrets_per_session": 5,
            "user_role_encoded": 0,
            "ip_hash": 3,
            "action_type_encoded": 1,
            "day_of_week": 3
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 200

        required_fields = ['anomaly_score', 'is_anomaly', 'confidence',
                           'confidence_pct', 'label']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"

    def test_confidence_is_percentage(self, client):
        """Confidence should be between 0 and 100."""
        payload = {
            "hour_of_day": 12,
            "secrets_per_session": 2,
            "user_role_encoded": 0,
            "ip_hash": 1,
            "action_type_encoded": 0,
            "day_of_week": 1
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert 0 <= data['confidence_pct'] <= 100

    def test_confidence_level_is_valid(self, client):
        """Confidence level should be one of: low, medium, high."""
        payload = {
            "hour_of_day": 12,
            "secrets_per_session": 2,
            "user_role_encoded": 0,
            "ip_hash": 1,
            "action_type_encoded": 0,
            "day_of_week": 1
        }
        response = client.post('/predict', json=payload)
        data = json.loads(response.data)
        assert data['confidence'] in ['low', 'medium', 'high']


# ── Batch Prediction Endpoint ───────────────────────────────────────────────

class TestBatchPredictEndpoint:
    def test_batch_predict_multiple_events(self, client):
        """Batch endpoint should handle multiple events."""
        payload = {
            "events": [
                {
                    "hour_of_day": 10, "secrets_per_session": 2,
                    "user_role_encoded": 1, "ip_hash": 2,
                    "action_type_encoded": 0, "day_of_week": 2
                },
                {
                    "hour_of_day": 3, "secrets_per_session": 80,
                    "user_role_encoded": 2, "ip_hash": 9,
                    "action_type_encoded": 2, "day_of_week": 6
                },
            ]
        }
        response = client.post('/predict/batch', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 200
        assert len(data['predictions']) == 2
        assert data['summary']['total'] == 2
        assert data['summary']['anomalies'] >= 1  # at least the anomalous one

    def test_batch_missing_events_key_returns_400(self, client):
        """Batch without 'events' key should fail."""
        response = client.post('/predict/batch', json={"data": []})
        assert response.status_code == 400

    def test_batch_empty_events_returns_400(self, client):
        """Batch with empty events list should fail."""
        response = client.post('/predict/batch', json={"events": []})
        assert response.status_code == 400

    def test_batch_event_with_missing_fields(self, client):
        """Batch with an event missing fields should fail."""
        payload = {
            "events": [
                {"hour_of_day": 10}  # missing other fields
            ]
        }
        response = client.post('/predict/batch', json=payload)
        data = json.loads(response.data)
        assert response.status_code == 400
        assert 'missing_fields' in data


# ── Helper Function Tests ────────────────────────────────────────────────────

class TestHelperFunctions:
    def test_normalize_confidence_negative_score(self):
        """Negative scores (anomalous) should map to 0-100%."""
        pct = normalize_confidence(-0.03)
        assert 0 <= pct <= 100

    def test_normalize_confidence_positive_score(self):
        """Positive scores (normal) should map to 0-100%."""
        pct = normalize_confidence(0.05)
        assert 0 <= pct <= 100

    def test_normalize_confidence_zero(self):
        """Zero score should return 0%."""
        pct = normalize_confidence(0.0)
        assert pct == 0.0

    def test_normalize_confidence_extreme_negative(self):
        """Very negative score should cap at 100%."""
        pct = normalize_confidence(-1.0)
        assert pct == 100.0

    def test_classify_confidence_high(self):
        assert classify_confidence(80) == 'high'

    def test_classify_confidence_medium(self):
        assert classify_confidence(50) == 'medium'

    def test_classify_confidence_low(self):
        assert classify_confidence(20) == 'low'

    def test_classify_confidence_boundary_70(self):
        assert classify_confidence(70) == 'medium'

    def test_classify_confidence_boundary_71(self):
        assert classify_confidence(71) == 'high'

    def test_validate_event_complete(self):
        """Complete event should return empty missing list."""
        event = {
            "hour_of_day": 10,
            "secrets_per_session": 1,
            "user_role_encoded": 0,
            "ip_hash": 1,
            "action_type_encoded": 0,
            "day_of_week": 1,
        }
        assert validate_event(event) == []

    def test_validate_event_missing_fields(self):
        """Incomplete event should return list of missing fields."""
        event = {"hour_of_day": 10}
        missing = validate_event(event)
        assert len(missing) == 5
        assert 'secrets_per_session' in missing


# ── Model Loading Tests ──────────────────────────────────────────────────────

class TestModelLoading:
    def test_model_is_loaded(self):
        """Model should be loaded at app startup."""
        assert model is not None

    def test_model_has_predict_method(self):
        """Model should have sklearn predict interface."""
        assert hasattr(model, 'predict')
        assert hasattr(model, 'decision_function')

    def test_model_is_pipeline(self):
        """Model should be an sklearn Pipeline (StandardScaler + IsolationForest)."""
        from sklearn.pipeline import Pipeline
        assert isinstance(model, Pipeline)
