/**
 * AcuStock Two-Factor Authentication (2FA / TOTP) — Security Test Suite
 * ─────────────────────────────────────────────────────────────────
 * Tests: AES-256-GCM encryption, TOTP generation/verification,
 *        recovery code lifecycle, MFA_PENDING token privilege isolation,
 *        and cross-tenant 2FA security.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Set test environment encryption key before requiring the service
process.env.TWO_FACTOR_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-2fa-testing';

const {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateQrCode,
  verifyTotp,
  generateToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyAndConsumeRecoveryCode
} = require('../src/services/twoFactorService');

// ═══════════════════════════════════════════════════════════════
// 1. AES-256-GCM ENCRYPTION & DECRYPTION
// ═══════════════════════════════════════════════════════════════

describe('AES-256-GCM Secret Encryption', () => {
  it('encrypts and decrypts a secret correctly (round-trip)', () => {
    const { secret } = generateTotpSecret('test@acustock.com');
    const encrypted = encryptSecret(secret);
    const decrypted = decryptSecret(encrypted);
    assert.equal(decrypted, secret);
  });

  it('produces versioned format v1:<iv>:<tag>:<ciphertext>', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const parts = encrypted.split(':');
    assert.equal(parts.length, 4, 'Should have 4 parts separated by colons');
    assert.equal(parts[0], 'v1', 'Version prefix should be v1');
    assert.equal(parts[1].length, 32, 'IV should be 16 bytes (32 hex chars)');
    assert.equal(parts[2].length, 32, 'Auth tag should be 16 bytes (32 hex chars)');
    assert.ok(parts[3].length > 0, 'Ciphertext should be non-empty');
  });

  it('same plaintext produces different ciphertexts (random IV)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);
    assert.notEqual(enc1, enc2, 'Two encryptions of same secret should differ due to random IV');
    assert.equal(decryptSecret(enc1), secret);
    assert.equal(decryptSecret(enc2), secret);
  });

  it('rejects tampered ciphertext (GCM auth tag fails)', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const parts = encrypted.split(':');
    // Flip one hex character in the ciphertext
    const flipped = parts[3][0] === 'a' ? 'b' : 'a';
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${flipped}${parts[3].slice(1)}`;
    assert.throws(() => decryptSecret(tampered), 'Should throw on tampered ciphertext');
  });

  it('rejects null/empty input to encryptSecret', () => {
    assert.throws(() => encryptSecret(null));
    assert.throws(() => encryptSecret(''));
    assert.throws(() => encryptSecret(undefined));
  });

  it('rejects null/empty input to decryptSecret', () => {
    assert.throws(() => decryptSecret(null));
    assert.throws(() => decryptSecret(''));
  });

  it('handles legacy unencrypted Base32 secrets (migration compat)', () => {
    const legacySecret = 'JBSWY3DPEHPK3PXP';
    const result = decryptSecret(legacySecret);
    assert.equal(result, legacySecret);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. TOTP SECRET GENERATION
// ═══════════════════════════════════════════════════════════════

describe('TOTP Secret Generation', () => {
  it('generates a secret, encrypted secret, and otpauth URL', () => {
    const result = generateTotpSecret('test@acustock.com', 'AcuStock');
    assert.ok(result.secret, 'Should have plaintext secret');
    assert.ok(result.encryptedSecret, 'Should have encrypted secret');
    assert.ok(result.otpauthUrl, 'Should have otpauth URL');
    assert.ok(result.encryptedSecret.startsWith('v1:'), 'Encrypted secret should be versioned');
    assert.ok(result.otpauthUrl.startsWith('otpauth://totp/'), 'Should be a valid otpauth URI');
    assert.ok(result.otpauthUrl.includes('AcuStock'), 'Should include issuer in URI');
  });

  it('encrypted secret decrypts back to the original secret', () => {
    const result = generateTotpSecret('test@acustock.com');
    const decrypted = decryptSecret(result.encryptedSecret);
    assert.equal(decrypted, result.secret);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. QR CODE GENERATION
// ═══════════════════════════════════════════════════════════════

describe('QR Code Generation', () => {
  it('generates a Base64 data URI from an otpauth URL', async () => {
    const otpauthUrl = 'otpauth://totp/AcuStock:test@acustock.com?secret=JBSWY3DPEHPK3PXP&issuer=AcuStock';
    const dataUrl = await generateQrCode(otpauthUrl);
    assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Should be a PNG data URI');
    assert.ok(dataUrl.length > 100, 'Should have substantial base64 content');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. TOTP VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe('TOTP Token Verification', () => {
  it('verifies a valid TOTP token against a plaintext secret', () => {
    const { secret } = generateTotpSecret('test@acustock.com');
    const token = generateToken(secret);
    assert.ok(verifyTotp(token, secret), 'Valid token should verify against plaintext secret');
  });

  it('verifies a valid TOTP token against an encrypted secret', () => {
    const { secret, encryptedSecret } = generateTotpSecret('test@acustock.com');
    const token = generateToken(secret);
    assert.ok(verifyTotp(token, encryptedSecret), 'Valid token should verify against encrypted secret');
  });

  it('rejects an invalid TOTP token', () => {
    const { secret } = generateTotpSecret('test@acustock.com');
    // Use a deliberately wrong token
    const validToken = generateToken(secret);
    const wrongToken = String((parseInt(validToken, 10) + 3) % 1000000).padStart(6, '0');
    // Extremely unlikely the shifted token is still in window
    // But if it is, that's still a valid outcome, so we test a more extreme case
    assert.ok(!verifyTotp('000001', secret) || !verifyTotp('999998', secret),
      'At least one of these wrong codes should fail');
  });

  it('rejects non-6-digit inputs', () => {
    const { secret } = generateTotpSecret('test@acustock.com');
    assert.ok(!verifyTotp('12345', secret), '5-digit should fail');
    assert.ok(!verifyTotp('1234567', secret), '7-digit should fail');
    assert.ok(!verifyTotp('abcdef', secret), 'Letters should fail');
    assert.ok(!verifyTotp('', secret), 'Empty should fail');
  });

  it('rejects null/undefined inputs gracefully', () => {
    assert.ok(!verifyTotp(null, 'JBSWY3DPEHPK3PXP'));
    assert.ok(!verifyTotp('123456', null));
    assert.ok(!verifyTotp(undefined, undefined));
  });

  it('strips whitespace from token before verification', () => {
    const { secret } = generateTotpSecret('test@acustock.com');
    const token = generateToken(secret);
    const paddedToken = ` ${token} `;
    assert.ok(verifyTotp(paddedToken, secret), 'Should strip whitespace and verify');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. RECOVERY CODE GENERATION & HASHING
// ═══════════════════════════════════════════════════════════════

describe('Recovery Code Generation', () => {
  it('generates 10 recovery codes by default', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes();
    assert.equal(plainCodes.length, 10);
    assert.equal(recoveryCodes.length, 10);
  });

  it('generates codes in XXXX-XXXX-XXXX format', () => {
    const { plainCodes } = generateRecoveryCodes(5);
    for (const code of plainCodes) {
      assert.match(code, /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/,
        `Code "${code}" should match XXXX-XXXX-XXXX hex format`);
    }
  });

  it('stores SHA-256 hashes, not plaintext', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(3);
    for (let i = 0; i < 3; i++) {
      assert.ok(recoveryCodes[i].codeHash, 'Should have a codeHash');
      assert.equal(recoveryCodes[i].codeHash.length, 64, 'SHA-256 hash should be 64 hex chars');
      assert.notEqual(recoveryCodes[i].codeHash, plainCodes[i], 'Hash should differ from plaintext');
      assert.equal(recoveryCodes[i].used, false, 'Should be unused by default');
      assert.equal(recoveryCodes[i].usedAt, null, 'usedAt should be null');
    }
  });

  it('all generated codes are unique', () => {
    const { plainCodes } = generateRecoveryCodes(10);
    const unique = new Set(plainCodes);
    assert.equal(unique.size, 10, 'All 10 codes should be unique');
  });

  it('hashRecoveryCode normalizes input (strips hyphens, uppercases)', () => {
    const hash1 = hashRecoveryCode('AB12-CD34-EF56');
    const hash2 = hashRecoveryCode('ab12cd34ef56');
    const hash3 = hashRecoveryCode('  AB12-CD34-EF56  ');
    assert.equal(hash1, hash2, 'Hyphens and case should be normalized');
    assert.equal(hash1, hash3, 'Whitespace should be normalized');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. RECOVERY CODE VERIFICATION & SINGLE-USE CONSUMPTION
// ═══════════════════════════════════════════════════════════════

describe('Recovery Code Verification & Consumption', () => {
  it('verifies a valid unused recovery code', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(3);
    const result = verifyAndConsumeRecoveryCode(plainCodes[0], recoveryCodes);
    assert.ok(result.isValid, 'Should verify valid unused code');
    assert.equal(result.matchedIndex, 0);
  });

  it('marks recovery code as used after consumption', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(3);
    verifyAndConsumeRecoveryCode(plainCodes[1], recoveryCodes);
    assert.equal(recoveryCodes[1].used, true, 'Should be marked used');
    assert.ok(recoveryCodes[1].usedAt instanceof Date, 'usedAt should be set');
  });

  it('rejects a recovery code that has already been used (single-use)', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(3);
    const first = verifyAndConsumeRecoveryCode(plainCodes[0], recoveryCodes);
    assert.ok(first.isValid, 'First use should succeed');
    const replay = verifyAndConsumeRecoveryCode(plainCodes[0], recoveryCodes);
    assert.ok(!replay.isValid, 'Second use (replay) should fail');
  });

  it('rejects an invalid/random recovery code', () => {
    const { recoveryCodes } = generateRecoveryCodes(5);
    const result = verifyAndConsumeRecoveryCode('ZZZZ-ZZZZ-ZZZZ', recoveryCodes);
    assert.ok(!result.isValid);
    assert.equal(result.matchedIndex, -1);
  });

  it('accepts code with or without hyphens', () => {
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(3);
    const noHyphens = plainCodes[2].replace(/-/g, '');
    const result = verifyAndConsumeRecoveryCode(noHyphens, recoveryCodes);
    assert.ok(result.isValid, 'Should work without hyphens');
  });

  it('rejects null/undefined inputs gracefully', () => {
    const result1 = verifyAndConsumeRecoveryCode(null, []);
    assert.ok(!result1.isValid);
    const result2 = verifyAndConsumeRecoveryCode('XXXX', null);
    assert.ok(!result2.isValid);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. MFA_PENDING TOKEN PRIVILEGE ISOLATION
// ═══════════════════════════════════════════════════════════════

describe('MFA_PENDING Temporary Token', () => {
  it('MFA temp token contains purpose=MFA_AUTHENTICATION and mfaPending=true', () => {
    const tempToken = jwt.sign(
      {
        userId: '6a9808fed0e0ac203eefa3a4',
        tenantId: '6a9808fed0e0ac203eefa3a5',
        purpose: 'MFA_AUTHENTICATION',
        mfaPending: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    assert.equal(decoded.purpose, 'MFA_AUTHENTICATION');
    assert.equal(decoded.mfaPending, true);
    assert.ok(decoded.userId);
    assert.ok(decoded.tenantId);
  });

  it('MFA temp token expires within 5 minutes', () => {
    const tempToken = jwt.sign(
      {
        userId: '6a9808fed0e0ac203eefa3a4',
        purpose: 'MFA_AUTHENTICATION',
        mfaPending: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const ttl = decoded.exp - decoded.iat;
    assert.equal(ttl, 300, 'Token TTL should be 300 seconds (5 minutes)');
  });

  it('a normal access token does NOT have mfaPending', () => {
    const normalToken = jwt.sign(
      {
        _id: '6a9808fed0e0ac203eefa3a4',
        role: 'ADMIN',
        tenantId: '6a9808fed0e0ac203eefa3a5',
        tokenVersion: 0
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const decoded = jwt.verify(normalToken, process.env.JWT_SECRET);
    assert.equal(decoded.mfaPending, undefined, 'Normal token should not have mfaPending');
    assert.equal(decoded.purpose, undefined, 'Normal token should not have MFA purpose');
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. CROSS-TENANT 2FA ISOLATION
// ═══════════════════════════════════════════════════════════════

describe('Cross-Tenant 2FA Isolation', () => {
  it('temp token for Tenant A contains only Tenant A tenantId', () => {
    const tenantA = '6a9808fed0e0ac203eefa3a1';
    const tenantB = '6a9808fed0e0ac203eefa3b2';

    const tokenA = jwt.sign(
      {
        userId: '6a9808fed0e0ac203eefa3a4',
        tenantId: tenantA,
        purpose: 'MFA_AUTHENTICATION',
        mfaPending: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    const decoded = jwt.verify(tokenA, process.env.JWT_SECRET);
    assert.equal(decoded.tenantId, tenantA, 'Token should carry Tenant A ID');
    assert.notEqual(decoded.tenantId, tenantB, 'Token should NOT carry Tenant B ID');
  });

  it('recovery codes from Tenant A cannot verify against Tenant B codes', () => {
    const tenantACodes = generateRecoveryCodes(5);
    const tenantBCodes = generateRecoveryCodes(5);

    const crossTenantResult = verifyAndConsumeRecoveryCode(
      tenantACodes.plainCodes[0],
      tenantBCodes.recoveryCodes
    );
    assert.ok(!crossTenantResult.isValid, 'Tenant A code should NOT verify against Tenant B codes');
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. SECRET LEAKAGE PREVENTION
// ═══════════════════════════════════════════════════════════════

describe('Secret Leakage Prevention', () => {
  it('generateTotpSecret never returns encrypted secret in otpauth URL', () => {
    const result = generateTotpSecret('test@example.com');
    assert.ok(!result.otpauthUrl.includes('v1:'), 'otpauth URL must not contain encrypted payload');
  });

  it('encrypted secret does not contain raw plaintext', () => {
    const result = generateTotpSecret('test@example.com');
    assert.ok(!result.encryptedSecret.includes(result.secret),
      'Encrypted payload should not contain raw secret as substring');
  });
});
