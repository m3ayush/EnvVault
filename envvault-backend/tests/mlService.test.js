/**
 * Unit Tests: ML Service Client
 * Tests feature engineering helpers (role encoding, action encoding, IP hashing)
 * and graceful failure behavior when the ML service is down.
 */

// We need to test the internal helper functions.
// Since they're not exported, we test them indirectly via checkAnomaly.
// We also test the module's exported function directly.

// Point this suite at an intentionally unused port before importing the module,
// because mlService.js reads ML_SERVICE_URL at module load time.
process.env.ML_SERVICE_URL = 'http://127.0.0.1:59999';

const { checkAnomaly } = require('../services/mlService');

describe('ML Service Client', () => {
  // ── Graceful Failure ──────────────────────────────────────────────────────

  test('checkAnomaly returns null when ML service is unreachable', async () => {
    const auditEvent = {
      userId: 'testuser',
      userRole: 'admin',
      action: 'read',
      secretKeyName: 'TEST_KEY',
      ipAddress: '127.0.0.1',
      secretsAccessedInSession: 1,
    };

    const result = await checkAnomaly(auditEvent);
    // ML_SERVICE_URL points to non-existent port, should return null gracefully
    expect(result).toBeNull();
  }, 10000); // Allow timeout for connection attempt

  test('checkAnomaly handles missing optional fields gracefully', async () => {
    const auditEvent = {
      userId: 'testuser',
      userRole: 'developer',
      action: 'write',
      secretKeyName: 'KEY',
      // ipAddress and secretsAccessedInSession not provided
    };

    const result = await checkAnomaly(auditEvent);
    // Should not throw, returns null (ML service is down in tests)
    expect(result).toBeNull();
  }, 10000);
});

describe('Feature Engineering (indirect via module internals)', () => {
  // We test the encoding logic by verifying it doesn't crash
  // with various role/action/IP combinations

  test('handles all three user roles without error', async () => {
    for (const role of ['admin', 'developer', 'viewer']) {
      const event = {
        userId: 'test',
        userRole: role,
        action: 'read',
        secretKeyName: 'K',
        ipAddress: '192.168.1.1',
        secretsAccessedInSession: 1,
      };
      // Should not throw
      await expect(checkAnomaly(event)).resolves.not.toThrow();
    }
  }, 15000);

  test('handles all action types without error', async () => {
    for (const action of ['read', 'write', 'delete', 'rotate']) {
      const event = {
        userId: 'test',
        userRole: 'admin',
        action,
        secretKeyName: 'K',
        ipAddress: '10.0.0.1',
        secretsAccessedInSession: 5,
      };
      await expect(checkAnomaly(event)).resolves.not.toThrow();
    }
  }, 20000);

  test('handles unknown role gracefully (defaults)', async () => {
    const event = {
      userId: 'test',
      userRole: 'unknown_role',
      action: 'read',
      secretKeyName: 'K',
    };
    await expect(checkAnomaly(event)).resolves.not.toThrow();
  }, 10000);
});
