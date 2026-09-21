const test = require('node:test');
const assert = require('node:assert/strict');
const { canJoinRoleRoom, canJoinUserRoom, authenticateSocketConnection } = require('../src/utils/socketAuth');

test('admins can join admin and manager rooms but users cannot', () => {
  const admin = { role: 'ADMIN' };
  const user = { role: 'USER' };

  assert.equal(canJoinRoleRoom(admin, 'ADMIN'), true);
  assert.equal(canJoinRoleRoom(admin, 'MANAGER'), true);
  assert.equal(canJoinRoleRoom(user, 'ADMIN'), false);
});

test('users can only join their own user rooms unless admin', () => {
  const user = { _id: '507f1f77bcf86cd799439011', role: 'USER' };
  const admin = { _id: '507f1f77bcf86cd799439012', role: 'ADMIN' };

  assert.equal(canJoinUserRoom(user, '507f1f77bcf86cd799439011'), true);
  assert.equal(canJoinUserRoom(user, '507f1f77bcf86cd799439999'), false);
  assert.equal(canJoinUserRoom(admin, '507f1f77bcf86cd799439999'), true);
});

test('socket authentication rejects inactive tenant memberships', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const Tenant = require('../src/models/Tenant');
  const originalUserFind = User.findById;
  const originalTenantFind = Tenant.findById;
  process.env.JWT_SECRET = 'release-0-socket-secret';
  const userId = '507f1f77bcf86cd799439011';
  const tenantId = '507f1f77bcf86cd799439012';
  User.findById = () => ({
    select: async () => ({ _id: userId, role: 'ADMIN', isActive: true, tokenVersion: 0, tenantId })
  });
  Tenant.findById = () => ({
    select: async () => ({ _id: tenantId, isActive: false, status: 'SUSPENDED' })
  });

  try {
    const token = jwt.sign({ _id: userId, tenantId, tokenVersion: 0 }, process.env.JWT_SECRET);
    const user = await authenticateSocketConnection({ handshake: { auth: { token }, headers: {} } });
    assert.equal(user, null);
  } finally {
    User.findById = originalUserFind;
    Tenant.findById = originalTenantFind;
  }
});
