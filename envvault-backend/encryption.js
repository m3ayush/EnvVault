const crypto = require('crypto');

// FIXED 32-byte key for AES-256 — deterministic so secrets survive restarts.
// Derived from a fixed passphrase using SHA-256 to guarantee exactly 32 bytes.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.createHash('sha256').update('envvault-demo-secret-key-2026').digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12); // 12 bytes for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  // Return the IV, Encrypted Text, and Auth Tag separated by colons
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

function decrypt(text) {
  const [ivHex, encryptedText, authTagHex] = text.split(':');

  if (!ivHex || !encryptedText || !authTagHex) {
    throw new Error('Invalid encrypted string format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
