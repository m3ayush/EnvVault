require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./encryption');
const { checkAnomaly } = require('./services/mlService');

const app = express();

// -- PROMETHEUS METRICS -------------------------------------------------------

let promClient;
let httpRequestCount, httpRequestDuration, activeRequests, anomalyCounter;

try {
  promClient = require('prom-client');

  // Create a Registry
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  // Custom metrics
  httpRequestCount = new promClient.Counter({
    name: 'envvault_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  httpRequestDuration = new promClient.Histogram({
    name: 'envvault_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  activeRequests = new promClient.Gauge({
    name: 'envvault_active_requests',
    help: 'Number of currently active requests',
    registers: [register],
  });

  anomalyCounter = new promClient.Counter({
    name: 'envvault_anomalies_detected_total',
    help: 'Total number of anomalies detected by ML service',
    labelNames: ['action', 'user_role'],
    registers: [register],
  });

  // Metrics middleware
  app.use((req, res, next) => {
    if (req.path === '/metrics') return next();
    if (activeRequests) activeRequests.inc();
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      if (activeRequests) activeRequests.dec();
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route ? req.route.path : req.path;
      if (httpRequestCount) httpRequestCount.inc({ method: req.method, route, status_code: res.statusCode });
      if (httpRequestDuration) httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    });
    next();
  });

  // Metrics endpoint for Prometheus scraping
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  console.log('[METRICS] Prometheus metrics available at /metrics');
} catch (e) {
  console.log('[METRICS] prom-client not installed, metrics disabled');
}

// -- SECURITY MIDDLEWARE -----------------------------------------------------

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// CORS — lock to known origins in production
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// -- JSON FILE DATABASE ------------------------------------------------------

const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading db.json, creating fresh one');
  }
  return { secrets: [], auditLogs: [] };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function genId() {
  return crypto.randomBytes(12).toString('hex');
}

// In-memory session counters for ML features
const sessionStats = {};

console.log('Using local JSON file database (db.json)');

// -- HELPER: create audit log + run ML check ---------------------------------

async function createAuditLog(db, logData) {
  const log = {
    _id: genId(),
    userId: logData.userId || 'unknown',
    userRole: logData.userRole || 'developer',
    action: logData.action,
    secretKeyName: logData.secretKeyName,
    ipAddress: logData.ipAddress || '127.0.0.1',
    secretsAccessedInSession: logData.secretsAccessedInSession || 1,
    is_anomaly: false,
    anomaly_score: null,
    anomaly_confidence: null,
    timestamp: new Date().toISOString(),
  };

  // Run ML anomaly detection (non-blocking — won't crash if ML service is down)
  const prediction = await checkAnomaly(log);
  if (prediction) {
    log.is_anomaly = prediction.is_anomaly || false;
    log.anomaly_score = prediction.anomaly_score || null;
    log.anomaly_confidence = prediction.confidence_pct || null;

    // Track anomaly metrics for Prometheus
    if (log.is_anomaly && anomalyCounter) {
      anomalyCounter.inc({ action: log.action, user_role: log.userRole });
    }
  }

  db.auditLogs.push(log);
  return log;
}

// -- ROUTES ------------------------------------------------------------------

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'envvault-backend',
    version: '1.0.0',
    endpoints: ['/api/health', '/api/secrets', '/api/audit-logs', '/api/secrets/raw'],
  });
});

// Health check
app.get('/api/health', (req, res) => {
  const db = loadDB();
  res.json({
    status: 'ok',
    database: 'json-file',
    secrets: db.secrets.length,
    auditLogs: db.auditLogs.length,
  });
});

// Create Secret
app.post('/api/secrets', async (req, res) => {
  try {
    const { keyName, value, userId, userRole, projectId } = req.body;

    if (!keyName || !value || !userId) {
      return res.status(400).json({ error: 'Missing required fields: keyName, value, userId' });
    }

    const db = loadDB();
    const encryptedValue = encrypt(value);

    const newSecret = {
      _id: genId(),
      keyName,
      encryptedValue,
      projectId: projectId || 'default',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.secrets.push(newSecret);

    const log = await createAuditLog(db, {
      userId,
      userRole,
      action: 'write',
      secretKeyName: keyName,
      secretsAccessedInSession: 1,
    });

    saveDB(db);

    console.log(`[SECRET CREATED] "${keyName}" by ${userId} (AES-256-GCM) | anomaly=${log.is_anomaly}`);
    res.status(201).json({ message: 'Secret created and encrypted securely.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Read Secrets
app.get('/api/secrets', async (req, res) => {
  try {
    const { userId, userRole, projectId } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({ error: 'Missing userId or userRole in query' });
    }

    const db = loadDB();

    let secrets = db.secrets;
    if (projectId) {
      secrets = secrets.filter(s => s.projectId === projectId);
    }

    if (!sessionStats[userId]) sessionStats[userId] = 0;

    const results = [];

    for (const secret of secrets) {
      let returnedValue = '********';

      if (userRole === 'admin' || userRole === 'developer') {
        returnedValue = decrypt(secret.encryptedValue);
        sessionStats[userId] += 1;

        await createAuditLog(db, {
          userId,
          userRole,
          action: 'read',
          secretKeyName: secret.keyName,
          secretsAccessedInSession: sessionStats[userId],
        });
      }

      results.push({
        _id: secret._id,
        keyName: secret.keyName,
        value: returnedValue,
        createdBy: secret.createdBy,
        createdAt: secret.createdAt,
      });
    }

    saveDB(db);
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Rotate Secret
app.put('/api/secrets/:id/rotate', async (req, res) => {
  try {
    const { userId, userRole } = req.body;
    const db = loadDB();
    const secret = db.secrets.find(s => s._id === req.params.id);

    if (!secret) return res.status(404).json({ error: 'Secret not found' });

    const newValue = 'rotated_' + crypto.randomBytes(16).toString('hex');
    secret.encryptedValue = encrypt(newValue);
    secret.updatedAt = new Date().toISOString();

    const log = await createAuditLog(db, {
      userId,
      userRole,
      action: 'rotate',
      secretKeyName: secret.keyName,
      secretsAccessedInSession: 1,
    });

    saveDB(db);
    console.log(`[SECRET ROTATED] "${secret.keyName}" by ${userId} | anomaly=${log.is_anomaly}`);
    res.json({ message: `Secret "${secret.keyName}" rotated successfully.`, newValue });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Secret
app.delete('/api/secrets/:id', async (req, res) => {
  try {
    const { userId, userRole } = req.query;
    const db = loadDB();
    const idx = db.secrets.findIndex(s => s._id === req.params.id);

    if (idx === -1) return res.status(404).json({ error: 'Secret not found' });

    const secret = db.secrets[idx];
    db.secrets.splice(idx, 1);

    const log = await createAuditLog(db, {
      userId,
      userRole,
      action: 'delete',
      secretKeyName: secret.keyName,
      secretsAccessedInSession: 1,
    });

    saveDB(db);
    console.log(`[SECRET DELETED] "${secret.keyName}" by ${userId} | anomaly=${log.is_anomaly}`);
    res.json({ message: 'Secret deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Audit Logs (Admin only)
app.get('/api/audit-logs', (req, res) => {
  try {
    const db = loadDB();
    const logs = db.auditLogs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Raw encrypted data (demo endpoint)
app.get('/api/secrets/raw', (req, res) => {
  try {
    const db = loadDB();
    const raw = db.secrets.map(s => ({
      keyName: s.keyName,
      encryptedValue: s.encryptedValue,
      createdBy: s.createdBy,
    }));
    res.json(raw);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// -- START SERVER ------------------------------------------------------------

const PORT = process.env.PORT || 3001;

// Only start server if this file is run directly (not imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  EnvVault Backend running on http://localhost:${PORT}`);
    console.log(`  Database: ${DB_FILE}`);
    console.log(`  Encryption: AES-256-GCM`);
    console.log(`  ML Service: ${process.env.ML_SERVICE_URL || 'http://localhost:8000'}\n`);
  });
}

// Export for testing
module.exports = app;
