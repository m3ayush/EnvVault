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
app.listen(PORT, () => {
  console.log(`\n  EnvVault Backend running on http://localhost:${PORT}`);
  console.log(`  Database: ${DB_FILE}`);
  console.log(`  Encryption: AES-256-GCM`);
  console.log(`  ML Service: ${process.env.ML_SERVICE_URL || 'http://localhost:8000'}\n`);
});
