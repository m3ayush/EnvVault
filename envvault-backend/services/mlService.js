const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Call the ML service to check if an audit event is anomalous.
 * Returns the prediction result or null if the ML service is unavailable.
 */
async function checkAnomaly(auditEvent) {
  try {
    const payload = {
      hour_of_day: new Date().getHours(),
      secrets_per_session: auditEvent.secretsAccessedInSession || 1,
      user_role_encoded: encodeRole(auditEvent.userRole),
      ip_hash: hashIpBucket(auditEvent.ipAddress || '127.0.0.1'),
      action_type_encoded: encodeAction(auditEvent.action),
      day_of_week: new Date().getDay(),
    };

    const response = await axios.post(`${ML_SERVICE_URL}/predict`, payload, {
      timeout: 3000,
    });

    const prediction = response.data;

    if (prediction && prediction.is_anomaly) {
      console.warn(
        `[ANOMALY DETECTED] User: ${auditEvent.userId}, Action: ${auditEvent.action}, ` +
        `Score: ${prediction.anomaly_score}, Confidence: ${prediction.confidence}`
      );
    }

    return prediction;
  } catch (error) {
    // ML service down is non-fatal — log and continue
    if (error.code === 'ECONNREFUSED') {
      console.warn('[ML Service] Not reachable (is it running?)');
    } else {
      console.warn('[ML Service] Prediction failed:', error.message);
    }
    return null;
  }
}

function encodeRole(role) {
  const roles = { admin: 0, developer: 1, viewer: 2 };
  return roles[role] ?? 1;
}

function encodeAction(action) {
  const actions = { read: 0, write: 1, delete: 2, rotate: 1 };
  return actions[action] ?? 0;
}

function hashIpBucket(ip) {
  const hash = ip.split('.').reduce((sum, octet) => sum + parseInt(octet, 10), 0);
  return (hash % 10) + 1;
}

module.exports = { checkAnomaly };
