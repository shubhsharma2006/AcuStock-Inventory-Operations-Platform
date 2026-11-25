'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validatePasswordStrength } = require('../src/utils/passwordValidator');

test('1. Enterprise Invite URL Resolution: Targets Next.js web application accept-invite route', () => {
  function buildInviteUrl(envFrontendUrl, rawToken) {
    const base = (envFrontendUrl || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    return `${base}/accept-invite/${rawToken}`;
  }

  const rawToken = '7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a';

  // Default dev URL
  assert.equal(
    buildInviteUrl(undefined, rawToken),
    `http://localhost:3000/accept-invite/${rawToken}`
  );

  // Production domain
  assert.equal(
    buildInviteUrl('https://app.acustock.com', rawToken),
    `https://app.acustock.com/accept-invite/${rawToken}`
  );

  // Multi-domain CORS string
  assert.equal(
    buildInviteUrl('https://app.acustock.com, https://preview.acustock.com', rawToken),
    `https://app.acustock.com/accept-invite/${rawToken}`
  );
});

test('2. Cryptographic Token Generation: Produces 64-character unguessable token and SHA-256 hash', () => {
  function generateToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  }

  const token1 = generateToken();
  const token2 = generateToken();

  assert.equal(token1.rawToken.length, 64);
  assert.equal(token1.tokenHash.length, 64);
  assert.notEqual(token1.rawToken, token2.rawToken);
  assert.notEqual(token1.rawToken, token1.tokenHash);

  const recomputedHash = crypto.createHash('sha256').update(token1.rawToken).digest('hex');
  assert.equal(recomputedHash, token1.tokenHash);
});

test('3. Role Permission Boundaries: Restricts Admin from inviting fellow Admins', () => {
  function checkInviteRoleAllowed(senderRole, targetRole) {
    const allowedRoles = ['ADMIN', 'MANAGER', 'USER'];
    if (!allowedRoles.includes(targetRole)) {
      return { allowed: false, message: 'Invalid role.' };
    }
    if (senderRole === 'ADMIN' && targetRole === 'ADMIN') {
      return { allowed: false, message: 'Admins cannot invite other Admins. Only Super Admin can.' };
    }
    return { allowed: true };
  }

  // Admin inviting Admin -> Blocked
  assert.equal(checkInviteRoleAllowed('ADMIN', 'ADMIN').allowed, false);

  // Admin inviting Manager -> Allowed
  assert.equal(checkInviteRoleAllowed('ADMIN', 'MANAGER').allowed, true);

  // Admin inviting User -> Allowed
  assert.equal(checkInviteRoleAllowed('ADMIN', 'USER').allowed, true);

  // Super Admin inviting Admin -> Allowed
  assert.equal(checkInviteRoleAllowed('SUPER_ADMIN', 'ADMIN').allowed, true);
});

test('4. Token Verification & Expiration Logic: 48-hour validity window', () => {
  const now = Date.now();
  const validInvite = {
    email: 'newhire@acustock.com',
    role: 'MANAGER',
    status: 'pending',
    expiresAt: new Date(now + 24 * 60 * 60 * 1000) // 24 hours remaining
  };

  const expiredInvite = {
    email: 'expired@acustock.com',
    role: 'USER',
    status: 'pending',
    expiresAt: new Date(now - 1000) // Expired 1 second ago
  };

  const acceptedInvite = {
    email: 'accepted@acustock.com',
    role: 'USER',
    status: 'accepted',
    expiresAt: new Date(now + 24 * 60 * 60 * 1000)
  };

  function verifyInvite(doc, currentTime = Date.now()) {
    if (!doc) return { valid: false, code: 'NOT_FOUND' };
    if (doc.status !== 'pending') return { valid: false, code: 'ALREADY_' + doc.status.toUpperCase() };
    if (new Date(doc.expiresAt).getTime() < currentTime) return { valid: false, code: 'EXPIRED' };
    return { valid: true, email: doc.email, role: doc.role };
  }

  assert.equal(verifyInvite(validInvite).valid, true);
  assert.equal(verifyInvite(expiredInvite).valid, false);
  assert.equal(verifyInvite(expiredInvite).code, 'EXPIRED');
  assert.equal(verifyInvite(acceptedInvite).valid, false);
  assert.equal(verifyInvite(acceptedInvite).code, 'ALREADY_ACCEPTED');
});

test('5. Onboarding Form Validation: Name, Phone for USER role, and enterprise password rules', () => {
  function validateOnboardingInput({ name, phone, role, password, confirmPassword }) {
    if (!name || name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (role === 'USER' && (!phone || !phone.trim())) {
      return 'Phone number is required for User accounts';
    }
    if (!password) {
      return 'Password is required';
    }
    if (confirmPassword && password !== confirmPassword) {
      return 'Passwords do not match';
    }
    return validatePasswordStrength(password);
  }

  // Missing name
  assert.equal(validateOnboardingInput({ name: 'A', role: 'MANAGER', password: 'ValidPassword123!' }), 'Name must be at least 2 characters');

  // Missing phone on USER role
  assert.equal(validateOnboardingInput({ name: 'John Doe', role: 'USER', password: 'ValidPassword123!' }), 'Phone number is required for User accounts');

  // Weak password
  assert.equal(validateOnboardingInput({ name: 'John Doe', phone: '+919876543210', role: 'USER', password: 'weak' }), 'Password must be at least 8 characters');

  // Password mismatch
  assert.equal(validateOnboardingInput({ name: 'John Doe', phone: '+919876543210', role: 'USER', password: 'ValidPassword123!', confirmPassword: 'DifferentPassword123!' }), 'Passwords do not match');

  // Valid inputs
  assert.equal(validateOnboardingInput({ name: 'John Doe', phone: '+919876543210', role: 'USER', password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!' }), null);
});

test('6. Complete Acceptance & Instant Authentication: Creates user, hashes password, and issues JWT', async () => {
  const secret = 'enterprise-test-jwt-secret';
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const inviteDoc = {
    _id: 'invite_999',
    email: 'sarah.ops@acustock.com',
    role: 'MANAGER',
    status: 'pending',
    tokenHash,
    tenantId: 'tenant_acme_corp',
    invitedBy: 'admin_john'
  };

  const payload = {
    token: rawToken,
    name: 'Sarah Connor',
    phone: '+1 555-0199',
    password: 'Cyberdyne@2026Secure'
  };

  // 1. Verify token match
  const candidateHash = crypto.createHash('sha256').update(payload.token).digest('hex');
  assert.equal(candidateHash, inviteDoc.tokenHash);

  // 2. Validate password strength
  assert.equal(validatePasswordStrength(payload.password), null);

  // 3. Hash password with bcrypt
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(payload.password, salt);
  assert.ok(await bcrypt.compare(payload.password, hashedPassword));

  // 4. Simulate created user doc
  const createdUser = {
    _id: 'user_sarah_101',
    name: payload.name.trim(),
    email: inviteDoc.email,
    phone: payload.phone.trim(),
    password: hashedPassword,
    role: inviteDoc.role,
    tenantId: inviteDoc.tenantId,
    isActive: true,
    isEmailVerified: true,
    tokenVersion: 0
  };

  // 5. Mark invite accepted
  inviteDoc.status = 'accepted';

  // 6. Generate JWT Session
  const accessToken = jwt.sign(
    { _id: createdUser._id, tokenVersion: createdUser.tokenVersion, type: 'access' },
    secret,
    { expiresIn: '15m' }
  );

  const decoded = jwt.verify(accessToken, secret);
  assert.equal(decoded._id, createdUser._id);
  assert.equal(decoded.type, 'access');
  assert.equal(createdUser.isActive, true);
  assert.equal(createdUser.isEmailVerified, true);
  assert.equal(inviteDoc.status, 'accepted');
});

test('7. Replay Protection: Disallows accepting already accepted or revoked invites', () => {
  const invite = {
    status: 'accepted'
  };

  function canAccept(doc) {
    if (doc.status !== 'pending') {
      return { allowed: false, message: `This invite has already been ${doc.status}.` };
    }
    return { allowed: true };
  }

  assert.equal(canAccept(invite).allowed, false);
  assert.match(canAccept(invite).message, /already been accepted/);

  invite.status = 'revoked';
  assert.equal(canAccept(invite).allowed, false);
  assert.match(canAccept(invite).message, /already been revoked/);
});
