const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const UserPermission = require('../src/models/UserPermission');
const Permission = require('../src/models/permission');
const requirePermission = require('../src/middleware/requirePermission');
const { invalidatePermissionCache } = require('../src/middleware/requirePermission');

test('UserPermission - model schema accepts overrides and enforces hard-locked fields', async () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const userPerm = new UserPermission({
    userId: dummyUserId,
    tenantId: dummyTenantId,
    canStockIn: true,
    canStockOut: false,
    canAddProduct: true,
    canEditStock: true,    // Attempting to bypass hard lock
    canDeleteStock: true,  // Attempting to bypass hard lock
    canManageAdmins: true  // Attempting to bypass hard lock
  });

  assert.equal(userPerm.validateSync(), undefined);

  // Trigger pre-save hook
  const preSaveFns = userPerm.schema.s.hooks._pres.get('save') || [];
  for (const hook of preSaveFns) {
    hook.fn.call(userPerm, () => {});
  }

  // Hard-locked invariants must always be false
  assert.equal(userPerm.canEditStock, false, 'canEditStock must remain false');
  assert.equal(userPerm.canDeleteStock, false, 'canDeleteStock must remain false');
  assert.equal(userPerm.canManageAdmins, false, 'canManageAdmins must remain false');
  assert.equal(userPerm.canStockIn, true);
  assert.equal(userPerm.canStockOut, false);
});

test('requirePermission - SUPER_ADMIN bypasses all checks', async () => {
  const middleware = requirePermission('canManageAdmins');
  const req = {
    user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' },
    tenantId: new mongoose.Types.ObjectId()
  };
  let nextCalled = false;
  const res = {};

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('requirePermission - user-level override takes precedence over role default', async () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  invalidatePermissionCache();

  // Mock UserPermission.findOne to return canStockIn: false
  const origUserFindOne = UserPermission.findOne;
  const origRoleFindOne = Permission.findOne;

  UserPermission.findOne = () => ({
    lean: async () => ({
      userId: dummyUserId,
      tenantId: dummyTenantId,
      canStockIn: false // Explicitly denied
    })
  });

  // Even if role default allows stock in
  Permission.findOne = () => ({
    lean: async () => ({
      role: 'MANAGER',
      tenantId: dummyTenantId,
      canStockIn: true
    })
  });

  try {
    const middleware = requirePermission('canStockIn');
    const req = {
      user: { _id: dummyUserId, role: 'MANAGER', tenantId: dummyTenantId },
      tenantId: dummyTenantId
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'Should be denied by user override');
    assert.equal(statusCode, 403);
    assert.ok(jsonResponse.message.includes('Permission denied: canStockIn'));
  } finally {
    UserPermission.findOne = origUserFindOne;
    Permission.findOne = origRoleFindOne;
    invalidatePermissionCache();
  }
});

test('requirePermission - user with null override falls back to role default', async () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  invalidatePermissionCache();

  const origUserFindOne = UserPermission.findOne;
  const origRoleFindOne = Permission.findOne;

  UserPermission.findOne = () => ({
    lean: async () => ({
      userId: dummyUserId,
      tenantId: dummyTenantId,
      canStockIn: null // Inherit from role
    })
  });

  Permission.findOne = () => ({
    lean: async () => ({
      role: 'USER',
      tenantId: dummyTenantId,
      canStockIn: true
    })
  });

  try {
    const middleware = requirePermission('canStockIn');
    const req = {
      user: { _id: dummyUserId, role: 'USER', tenantId: dummyTenantId },
      tenantId: dummyTenantId
    };

    let nextCalled = false;
    await middleware(req, {}, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'Should allow based on role default');
  } finally {
    UserPermission.findOne = origUserFindOne;
    Permission.findOne = origRoleFindOne;
    invalidatePermissionCache();
  }
});
