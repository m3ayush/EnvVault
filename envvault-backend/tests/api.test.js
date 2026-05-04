/**
 * Integration Tests: EnvVault Backend REST API
 * Tests CRUD operations, role-based access, health checks,
 * and audit log creation.
 *
 * Note: Uses a temporary db.json to avoid corrupting real data.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Set test DB path BEFORE requiring the server
const TEST_DB_PATH = path.join(__dirname, 'test-db.json');
process.env.DB_PATH = TEST_DB_PATH;
process.env.ML_SERVICE_URL = 'http://localhost:9999'; // non-existent, ML failures are non-fatal

let server;
let baseUrl;

// ── SETUP / TEARDOWN ────────────────────────────────────────────────────────

beforeAll((done) => {
  // Reset test database
  fs.writeFileSync(TEST_DB_PATH, JSON.stringify({ secrets: [], auditLogs: [] }));

  // Import the app after setting env vars
  const app = require('../server');

  // Start on random port
  server = app.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

// ── HELPERS ─────────────────────────────────────────────────────────────────

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── TESTS ───────────────────────────────────────────────────────────────────

describe('Health Check', () => {
  test('GET / returns service info', async () => {
    const res = await makeRequest('GET', '/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('envvault-backend');
    expect(res.body.endpoints).toContain('/api/health');
  });

  test('GET /api/health returns ok status with db stats', async () => {
    const res = await makeRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('json-file');
    expect(typeof res.body.secrets).toBe('number');
    expect(typeof res.body.auditLogs).toBe('number');
  });
});

describe('Secret CRUD Operations', () => {
  let createdSecretId;

  test('POST /api/secrets creates a new encrypted secret', async () => {
    const res = await makeRequest('POST', '/api/secrets', {
      keyName: 'TEST_API_KEY',
      value: 'sk-test-123456789',
      userId: 'testuser',
      userRole: 'admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('Secret created');
  });

  test('POST /api/secrets rejects missing required fields', async () => {
    const res = await makeRequest('POST', '/api/secrets', {
      keyName: 'INCOMPLETE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
  });

  test('GET /api/secrets returns decrypted values for admin', async () => {
    const res = await makeRequest('GET', '/api/secrets?userId=testuser&userRole=admin');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const secret = res.body.find((s) => s.keyName === 'TEST_API_KEY');
    expect(secret).toBeDefined();
    expect(secret.value).toBe('sk-test-123456789');
    createdSecretId = secret._id;
  });

  test('GET /api/secrets returns redacted values for viewer', async () => {
    const res = await makeRequest('GET', '/api/secrets?userId=viewer1&userRole=viewer');
    expect(res.status).toBe(200);
    const secret = res.body.find((s) => s.keyName === 'TEST_API_KEY');
    expect(secret).toBeDefined();
    expect(secret.value).toBe('********');
  });

  test('GET /api/secrets rejects missing userId/userRole', async () => {
    const res = await makeRequest('GET', '/api/secrets');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing userId or userRole');
  });

  test('PUT /api/secrets/:id/rotate rotates secret value', async () => {
    const res = await makeRequest('PUT', `/api/secrets/${createdSecretId}/rotate`, {
      userId: 'testuser',
      userRole: 'admin',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('rotated successfully');
    expect(res.body.newValue).toMatch(/^rotated_/);
  });

  test('PUT /api/secrets/:id/rotate returns 404 for invalid id', async () => {
    const res = await makeRequest('PUT', '/api/secrets/nonexistent123/rotate', {
      userId: 'testuser',
      userRole: 'admin',
    });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/secrets/:id deletes a secret', async () => {
    const res = await makeRequest(
      'DELETE',
      `/api/secrets/${createdSecretId}?userId=testuser&userRole=admin`
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Secret deleted.');
  });

  test('DELETE /api/secrets/:id returns 404 for already deleted', async () => {
    const res = await makeRequest(
      'DELETE',
      `/api/secrets/${createdSecretId}?userId=testuser&userRole=admin`
    );
    expect(res.status).toBe(404);
  });
});

describe('Audit Logs', () => {
  test('GET /api/audit-logs returns audit entries', async () => {
    const res = await makeRequest('GET', '/api/audit-logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should have logs from previous CRUD operations
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('audit log entries contain required fields', async () => {
    const res = await makeRequest('GET', '/api/audit-logs');
    const log = res.body[0];
    expect(log).toHaveProperty('_id');
    expect(log).toHaveProperty('userId');
    expect(log).toHaveProperty('userRole');
    expect(log).toHaveProperty('action');
    expect(log).toHaveProperty('secretKeyName');
    expect(log).toHaveProperty('timestamp');
    expect(log).toHaveProperty('is_anomaly');
  });

  test('audit logs are sorted by timestamp descending', async () => {
    const res = await makeRequest('GET', '/api/audit-logs');
    for (let i = 1; i < res.body.length; i++) {
      const prev = new Date(res.body[i - 1].timestamp);
      const curr = new Date(res.body[i].timestamp);
      expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
    }
  });
});

describe('Raw Encrypted Data Endpoint', () => {
  test('GET /api/secrets/raw returns encrypted values', async () => {
    // First create a secret
    await makeRequest('POST', '/api/secrets', {
      keyName: 'RAW_TEST_KEY',
      value: 'raw-test-value',
      userId: 'testuser',
      userRole: 'admin',
    });

    const res = await makeRequest('GET', '/api/secrets/raw');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const rawSecret = res.body.find((s) => s.keyName === 'RAW_TEST_KEY');
    expect(rawSecret).toBeDefined();
    // Encrypted value should be in IV:ciphertext:authTag format
    expect(rawSecret.encryptedValue.split(':').length).toBe(3);
  });
});
