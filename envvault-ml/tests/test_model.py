"""
Unit Tests: Model Artifact Validation
Tests that model.pkl loads correctly, has the expected structure,
and produces valid outputs on known inputs.
"""

import os
import sys
import pytest
import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'model.pkl')

FEATURE_COLUMNS = [
    "hour_of_day",
    "secrets_per_session",
    "user_role_encoded",
    "ip_hash",
    "action_type_encoded",
    "day_of_week",
]


@pytest.fixture(scope="module")
def model():
    """Load the model once for all tests in this module."""
    assert os.path.exists(MODEL_PATH), f"model.pkl not found at {MODEL_PATH}"
    return joblib.load(MODEL_PATH)


class TestModelArtifact:
    def test_model_file_exists(self):
        """model.pkl must exist in the ml service directory."""
        assert os.path.exists(MODEL_PATH)

    def test_model_file_not_empty(self):
        """model.pkl must have content."""
        assert os.path.getsize(MODEL_PATH) > 0

    def test_model_loads_without_error(self, model):
        """joblib.load should succeed without exceptions."""
        assert model is not None

    def test_model_is_sklearn_pipeline(self, model):
        """Model should be a Pipeline with scaler + estimator."""
        from sklearn.pipeline import Pipeline
        assert isinstance(model, Pipeline)
        assert len(model.steps) >= 2

    def test_model_has_scaler_step(self, model):
        """First step should be StandardScaler."""
        from sklearn.preprocessing import StandardScaler
        scaler = model.steps[0][1]
        assert isinstance(scaler, StandardScaler)

    def test_model_has_isolation_forest_step(self, model):
        """Second step should be IsolationForest."""
        from sklearn.ensemble import IsolationForest
        estimator = model.steps[1][1]
        assert isinstance(estimator, IsolationForest)


class TestModelPredictions:
    def test_predict_returns_valid_labels(self, model):
        """predict() should return 1 (normal) or -1 (anomaly)."""
        df = pd.DataFrame([[10, 3, 1, 2, 0, 2]], columns=FEATURE_COLUMNS)
        prediction = model.predict(df)
        assert prediction[0] in [1, -1]

    def test_decision_function_returns_float(self, model):
        """decision_function() should return a float score."""
        df = pd.DataFrame([[10, 3, 1, 2, 0, 2]], columns=FEATURE_COLUMNS)
        score = model.decision_function(df)
        assert isinstance(float(score[0]), float)

    def test_normal_pattern_is_not_anomaly(self, model):
        """Normal work-hours access should be classified as normal (1)."""
        normal_event = pd.DataFrame(
            [[10, 3, 1, 2, 0, 2]],  # 10 AM, 3 secrets, developer, known IP, read, Tuesday
            columns=FEATURE_COLUMNS
        )
        prediction = model.predict(normal_event)
        assert prediction[0] == 1, "Normal pattern misclassified as anomaly"

    def test_anomalous_pattern_is_flagged(self, model):
        """Bulk access at 3 AM by viewer should be flagged (-1)."""
        anomaly_event = pd.DataFrame(
            [[3, 75, 2, 9, 2, 6]],  # 3 AM, 75 secrets, viewer, unknown IP, delete, Sunday
            columns=FEATURE_COLUMNS
        )
        prediction = model.predict(anomaly_event)
        assert prediction[0] == -1, "Anomalous pattern not detected"

    def test_batch_prediction_shape(self, model):
        """Batch predictions should match input count."""
        batch = pd.DataFrame([
            [10, 3, 1, 2, 0, 2],
            [3, 75, 2, 9, 2, 6],
            [14, 1, 0, 1, 1, 3],
        ], columns=FEATURE_COLUMNS)
        predictions = model.predict(batch)
        assert len(predictions) == 3

    def test_decision_function_anomaly_more_negative(self, model):
        """Anomalous events should have more negative decision scores."""
        normal = pd.DataFrame([[10, 3, 1, 2, 0, 2]], columns=FEATURE_COLUMNS)
        anomaly = pd.DataFrame([[3, 75, 2, 9, 2, 6]], columns=FEATURE_COLUMNS)

        normal_score = model.decision_function(normal)[0]
        anomaly_score = model.decision_function(anomaly)[0]

        assert anomaly_score < normal_score, \
            f"Anomaly score ({anomaly_score}) should be less than normal ({normal_score})"

    def test_handles_boundary_values(self, model):
        """Model should handle minimum and maximum feature values."""
        min_event = pd.DataFrame([[0, 1, 0, 1, 0, 0]], columns=FEATURE_COLUMNS)
        max_event = pd.DataFrame([[23, 100, 2, 10, 2, 6]], columns=FEATURE_COLUMNS)

        pred_min = model.predict(min_event)
        pred_max = model.predict(max_event)
        assert pred_min[0] in [1, -1]
        assert pred_max[0] in [1, -1]
