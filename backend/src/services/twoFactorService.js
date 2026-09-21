/**
 * AcuStock Two-Factor Authentication (2FA / TOTP) Cryptographic Engine
 * ─────────────────────────────────────────────────────────────────
 * RFC 6238 compliant TOTP generator & validator with versioned AES-256-GCM
 * secret encryption at rest and single-use SHA-256 hashed backup recovery codes.
 *
 * Compatible with otplib v14+ (new API surface).
 */

'use strict';

const crypto = require('crypto');
const otplib = require('otplib');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

// ── Key Management & Versioned AES-256-GCM Encryption ───────────
const KEY_VERSION = 'v1';

function getEncryptionKey() {
  const envKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  if (envKey && envKey.length === 32) {
    return Buffer.from(envKey, 'utf8');
  }
  // Fallback in development derived from JWT_SECRET
  const seed = process.env.JWT_SECRET || 'acustock-dev-secret-key-for-2fa-encryption-fallback';
  return crypto.createHash('sha256').update(seed).digest();
}

/**
 * Encrypts a plaintext TOTP secret with AES-256-GCM.
 * Output format: "v1:<hex-iv>:<hex-tag>:<hex-ciphertext>"
 *
 * @param {string} plainSecret - Base32 secret string
 * @returns {string} Versioned encrypted payload
 */
function encryptSecret(plainSecret) {
  if (!plainSecret || typeof plainSecret !== 'string') {
    throw new Error('Invalid secret for encryption');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16); // 128-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex'); // 128-bit auth tag

  return `${KEY_VERSION}:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts a versioned AES-256-GCM encrypted TOTP secret.
 *
 * @param {string} encryptedPayload - "v1:<hex-iv>:<hex-tag>:<hex-ciphertext>"
 * @returns {string} Plaintext base32 secret
 */
function decryptSecret(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('Invalid encrypted payload');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 4) {
    // If legacy unencrypted base32 secret (migration backward compatibility)
    if (/^[A-Z2-7=]+$/i.test(encryptedPayload)) {
      return encryptedPayload;
    }
    throw new Error('Malformed 2FA encrypted payload');
  }

  const [version, ivHex, tagHex, ciphertextHex] = parts;
  if (version !== KEY_VERSION) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ── TOTP Generation & Verification ─────────────────────────────

/**
 * Generates a new Base32 TOTP secret and builds the otpauth:// URI.
 *
 * @param {string} userEmail - User's account email or identifier
 * @param {string} [issuer='AcuStock'] - Organization / App name
 * @returns {{ secret: string, encryptedSecret: string, otpauthUrl: string }}
 */
function generateTotpSecret(userEmail, issuer = 'AcuStock') {
  const secret = otplib.generateSecret();
  const otpauthUrl = otplib.generateURI({
    secret,
    issuer,
    label: `${issuer}:${userEmail}`
  });
  const encryptedSecret = encryptSecret(secret);

  return {
    secret,
    encryptedSecret,
    otpauthUrl
  };
}

/**
 * Generates a Base64 Data URI QR Code from an otpauth:// URI for authenticator app scanning.
 *
 * @param {string} otpauthUrl
 * @returns {Promise<string>} Data URI string (e.g. "data:image/png;base64,...")
 */
async function generateQrCode(otpauthUrl) {
  try {
    return await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#0b1424',
        light: '#ffffff'
      }
    });
  } catch (err) {
    logger.error('[2FA] QR Code generation error:', err.message);
    throw new Error('Failed to generate QR code image');
  }
}

/**
 * Verifies a 6-digit TOTP token against a plain or encrypted secret.
 *
 * @param {string} token - 6-digit string from user's Authenticator app
 * @param {string} plainOrEncryptedSecret - Plaintext or versioned encrypted secret
 * @returns {boolean} True if token is valid within the time window
 */
function verifyTotp(token, plainOrEncryptedSecret) {
  if (!token || !plainOrEncryptedSecret) return false;

  const normalizedToken = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedToken)) return false;

  try {
    const plainSecret = plainOrEncryptedSecret.startsWith(`${KEY_VERSION}:`)
      ? decryptSecret(plainOrEncryptedSecret)
      : plainOrEncryptedSecret;

    const result = otplib.verifySync({ token: normalizedToken, secret: plainSecret });
    return result && result.valid === true;
  } catch (err) {
    logger.error('[2FA] Verification error:', err.message);
    return false;
  }
}

/**
 * Generates a TOTP token for a given secret (used only in tests).
 *
 * @param {string} secret - Base32 secret string
 * @returns {string} 6-digit TOTP code
 */
function generateToken(secret) {
  return otplib.generateSync({ secret });
}

// ── Single-Use Backup Recovery Codes ───────────────────────────

/**
 * Normalizes a recovery code string (uppercased, stripped of hyphens/whitespace).
 */
function normalizeRecoveryCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * Computes the SHA-256 hash of a normalized recovery code for storage.
 *
 * @param {string} plainCode
 * @returns {string} Hex hash string
 */
function hashRecoveryCode(plainCode) {
  const normalized = normalizeRecoveryCode(plainCode);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generates N cryptographically secure backup recovery codes.
 * Returns plaintext formatted codes (for user display once) and hashed records (for DB storage).
 *
 * @param {number} [count=10]
 * @returns {{ plainCodes: string[], recoveryCodes: Array<{ codeHash: string, used: boolean, usedAt: null }> }}
 */
function generateRecoveryCodes(count = 10) {
  const plainCodes = [];
  const recoveryCodes = [];

  for (let i = 0; i < count; i++) {
    // Generate 6 random bytes -> 12 hex chars -> formatted as XXXX-XXXX-XXXX
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;

    plainCodes.push(formatted);
    recoveryCodes.push({
      codeHash: hashRecoveryCode(formatted),
      used: false,
      usedAt: null
    });
  }

  return { plainCodes, recoveryCodes };
}

/**
 * Checks if a candidate code matches any unused recovery code for a user document.
 * If found, marks it used and updates `usedAt`.
 *
 * @param {string} candidateCode - User input (e.g. "AC7K-M9P2-X4QD" or "AC7KM9P2X4QD")
 * @param {Array<{ codeHash: string, used: boolean, usedAt: Date|null }>} storedCodesArray
 * @returns {{ isValid: boolean, matchedIndex: number }}
 */
function verifyAndConsumeRecoveryCode(candidateCode, storedCodesArray) {
  if (!candidateCode || !Array.isArray(storedCodesArray)) {
    return { isValid: false, matchedIndex: -1 };
  }

  const candidateHash = hashRecoveryCode(candidateCode);
  if (!candidateHash) {
    return { isValid: false, matchedIndex: -1 };
  }

  const matchedIndex = storedCodesArray.findIndex(
    (item) => !item.used && item.codeHash === candidateHash
  );

  if (matchedIndex !== -1) {
    storedCodesArray[matchedIndex].used = true;
    storedCodesArray[matchedIndex].usedAt = new Date();
    return { isValid: true, matchedIndex };
  }

  return { isValid: false, matchedIndex: -1 };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateQrCode,
  verifyTotp,
  generateToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyAndConsumeRecoveryCode
};
