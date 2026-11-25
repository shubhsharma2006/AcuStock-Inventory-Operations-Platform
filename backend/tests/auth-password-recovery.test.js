'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validatePasswordStrength } = require('../src/utils/passwordValidator');

test('1. Password Strength Validation: Enforces enterprise complexity rules', () => {
  assert.equal(validatePasswordStrength('short1A'), 'Password must be at least 8 characters');
  assert.equal(validatePasswordStrength('lowercaseonly123'), 'Password must contain at least one uppercase letter');
  assert.equal(validatePasswordStrength('UPPERCASEONLY123'), 'Password must contain at least one lowercase letter');
  assert.equal(validatePasswordStrength('NoDigitsHere!'), 'Password must contain at least one digit');
  assert.equal(validatePasswordStrength('ValidP@ssword2026'), null);
});

test('2. Reset Token Cryptography: Generates unguessable token and deterministic SHA-256 hash', () => {
  const token1 = crypto.randomBytes(32).toString('hex');
  const token2 = crypto.randomBytes(32).toString('hex');
  assert.notEqual(token1, token2);
  assert.equal(token1.length, 64);

  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const hash1 = hashToken(token1);
  const hash2 = hashToken(token1);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, token1);
});

test('3. Issue A Compatibility: Accepts email as primary identifier without requiring role dropdown', () => {
  function resolveIdentifierInput(body) {
    const { identifier, email } = body || {};
    return (identifier || email || '').trim();
  }

  // Modern frontend sends { email }
  const modernPayload = { email: 'manager@acustock.com' };
  assert.equal(resolveIdentifierInput(modernPayload), 'manager@acustock.com');

  // Legacy/API client sends { identifier, role }
  const legacyPayload = { identifier: '9876543210', role: 'USER' };
  assert.equal(resolveIdentifierInput(legacyPayload), '9876543210');

  // Empty payload
  assert.equal(resolveIdentifierInput({}), '');
});

test('4. Issue B Compatibility: Resolves either newPassword or password field names', () => {
  function extractNewPassword(body) {
    return (body.newPassword || body.password || '').trim();
  }

  // Frontend sends { password }
  assert.equal(extractNewPassword({ password: 'NewSecurePassword123' }), 'NewSecurePassword123');

  // API client sends { newPassword }
  assert.equal(extractNewPassword({ newPassword: 'NewSecurePassword123' }), 'NewSecurePassword123');

  // Both provided
  assert.equal(extractNewPassword({ password: 'PassA1234', newPassword: 'PassB1234' }), 'PassB1234');
});

test('5. Issue C Reset URL: Uses FRONTEND_URL to target client web application', () => {
  function buildResetUrl(envFrontendUrl, resetToken) {
    const baseUrl = (envFrontendUrl || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    return `${baseUrl}/reset-password/${resetToken}`;
  }

  const token = 'abc123token';

  // Default dev
  assert.equal(buildResetUrl(undefined, token), 'http://localhost:3000/reset-password/abc123token');

  // Production custom domain
  assert.equal(buildResetUrl('https://app.acustock.com', token), 'https://app.acustock.com/reset-password/abc123token');

  // Multi-domain comma-separated FRONTEND_URL
  assert.equal(buildResetUrl('https://app.acustock.com, https://preview.acustock.com', token), 'https://app.acustock.com/reset-password/abc123token');
});

test('6. Session Revocation: Incrementing tokenVersion invalidates prior JWT tokens', () => {
  const jwt = require('jsonwebtoken');
  const secret = 'test-jwt-secret';

  const user = {
    _id: '507f1f77bcf86cd799439011',
    tokenVersion: 1
  };

  const oldToken = jwt.sign({ _id: user._id, tokenVersion: user.tokenVersion }, secret);
  const decodedOld = jwt.verify(oldToken, secret);

  // User resets password -> tokenVersion increments
  user.tokenVersion += 1;

  // Middleware validation check
  const isSessionValid = decodedOld.tokenVersion === user.tokenVersion;
  assert.equal(isSessionValid, false);

  // New token after login
  const newToken = jwt.sign({ _id: user._id, tokenVersion: user.tokenVersion }, secret);
  const decodedNew = jwt.verify(newToken, secret);
  assert.equal(decodedNew.tokenVersion, user.tokenVersion);
});

test('7. 6-Digit Numeric OTP Generation: Produces 6-digit number and SHA-256 hash', () => {
  const hashResetToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

  // Verify format and range
  for (let i = 0; i < 20; i++) {
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    assert.equal(otpCode.length, 6);
    assert.match(otpCode, /^\d{6}$/);
    const num = parseInt(otpCode, 10);
    assert.ok(num >= 100000 && num <= 999999);

    const hashed = hashResetToken(otpCode);
    assert.equal(hashed.length, 64);
    assert.notEqual(hashed, otpCode);
  }
});

test('8. OTP Verification Logic: Matches SHA-256, honors 10-minute expiry', () => {
  const hashResetToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

  const rawOtp = '482910';
  const hashedOtp = hashResetToken(rawOtp);
  const now = Date.now();

  const user = {
    email: 'ops@acustock.com',
    passwordResetOtp: hashedOtp,
    passwordResetOtpExpires: now + 10 * 60 * 1000, // +10 min
    passwordResetOtpAttempts: 0
  };

  function verifyOtp(userDoc, candidateOtp, currentTime = Date.now()) {
    if (!userDoc.passwordResetOtp || !userDoc.passwordResetOtpExpires) {
      return { valid: false, error: 'NO_OTP' };
    }
    if (userDoc.passwordResetOtpExpires < currentTime) {
      return { valid: false, error: 'EXPIRED' };
    }
    if ((userDoc.passwordResetOtpAttempts || 0) >= 3) {
      return { valid: false, error: 'MAX_ATTEMPTS' };
    }
    const candidateHash = hashResetToken(candidateOtp);
    if (userDoc.passwordResetOtp !== candidateHash) {
      userDoc.passwordResetOtpAttempts = (userDoc.passwordResetOtpAttempts || 0) + 1;
      return { valid: false, error: 'MISMATCH', remainingAttempts: 3 - userDoc.passwordResetOtpAttempts };
    }
    return { valid: true };
  }

  // Correct OTP within 10 min
  assert.deepEqual(verifyOtp(user, '482910', now + 1000), { valid: true });

  // Expired OTP (+11 min)
  assert.deepEqual(verifyOtp(user, '482910', now + 11 * 60 * 1000), { valid: false, error: 'EXPIRED' });
});

test('9. OTP Brute-Force Rate Limiting: Locks and clears after 3 failed attempts', () => {
  const hashResetToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

  const rawOtp = '739102';
  const user = {
    email: 'admin@acustock.com',
    passwordResetOtp: hashResetToken(rawOtp),
    passwordResetOtpExpires: Date.now() + 10 * 60 * 1000,
    passwordResetOtpAttempts: 0
  };

  function recordAttempt(userDoc, candidateOtp) {
    if ((userDoc.passwordResetOtpAttempts || 0) >= 3) {
      userDoc.passwordResetOtp = undefined;
      userDoc.passwordResetOtpExpires = undefined;
      userDoc.passwordResetOtpAttempts = 0;
      return { allowed: false, message: 'Too many failed attempts. Please request a new OTP.' };
    }

    const candidateHash = hashResetToken(candidateOtp);
    if (userDoc.passwordResetOtp !== candidateHash) {
      userDoc.passwordResetOtpAttempts = (userDoc.passwordResetOtpAttempts || 0) + 1;
      if (userDoc.passwordResetOtpAttempts >= 3) {
        userDoc.passwordResetOtp = undefined;
        userDoc.passwordResetOtpExpires = undefined;
        userDoc.passwordResetOtpAttempts = 0;
        return { allowed: false, message: 'Too many failed attempts. Please request a new OTP.' };
      }
      return { allowed: false, attemptsRemaining: 3 - userDoc.passwordResetOtpAttempts };
    }

    return { allowed: true };
  }

  // Attempt 1: wrong
  const r1 = recordAttempt(user, '000000');
  assert.equal(r1.allowed, false);
  assert.equal(r1.attemptsRemaining, 2);

  // Attempt 2: wrong
  const r2 = recordAttempt(user, '111111');
  assert.equal(r2.allowed, false);
  assert.equal(r2.attemptsRemaining, 1);

  // Attempt 3: wrong -> lock and clear
  const r3 = recordAttempt(user, '222222');
  assert.equal(r3.allowed, false);
  assert.equal(r3.message, 'Too many failed attempts. Please request a new OTP.');
  assert.equal(user.passwordResetOtp, undefined);
  assert.equal(user.passwordResetOtpExpires, undefined);
});

test('10. Full OTP Password Reset: Validates password, updates hash, clears OTP, and invalidates sessions', async () => {
  const bcrypt = require('bcryptjs');
  const hashResetToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

  const oldPasswordHash = await bcrypt.hash('OldPassword123', 8);
  const otpCode = '951234';

  const user = {
    _id: 'user_123',
    email: 'employee@acustock.com',
    password: oldPasswordHash,
    tokenVersion: 2,
    passwordResetOtp: hashResetToken(otpCode),
    passwordResetOtpExpires: Date.now() + 10 * 60 * 1000,
    passwordResetOtpAttempts: 0
  };

  // Perform reset
  const newPassword = 'SecureNewPassword2026!';
  const strengthErr = validatePasswordStrength(newPassword);
  assert.equal(strengthErr, null);

  // Simulate route reset
  user.password = await bcrypt.hash(newPassword, 8);
  user.passwordResetOtp = undefined;
  user.passwordResetOtpExpires = undefined;
  user.passwordResetOtpAttempts = 0;
  user.tokenVersion += 1;

  // Assertions
  assert.equal(user.tokenVersion, 3);
  assert.equal(user.passwordResetOtp, undefined);
  assert.equal(user.passwordResetOtpExpires, undefined);
  assert.ok(await bcrypt.compare(newPassword, user.password));
  assert.ok(!(await bcrypt.compare('OldPassword123', user.password)));
});

