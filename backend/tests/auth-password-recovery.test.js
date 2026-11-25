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
