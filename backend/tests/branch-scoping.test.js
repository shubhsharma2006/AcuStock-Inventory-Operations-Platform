const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/User');

test('User - supports assignedWarehouseId in schema', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyWarehouseId = new mongoose.Types.ObjectId();

  const user = new User({
    name: 'Bengaluru Branch Operator',
    email: 'operator.blr@acustock.com',
    phone: '+919876543210',
    role: 'USER',
    password: 'Password123!',
    assignedWarehouseId: dummyWarehouseId,
    tenantId: dummyTenantId
  });

  assert.equal(user.name, 'Bengaluru Branch Operator');
  assert.equal(String(user.assignedWarehouseId), String(dummyWarehouseId));
  assert.equal(user.validateSync(), undefined);
});

test('Branch Scoping - stock action validation logic', () => {
  function validateBranchAccess(user, requestedWarehouseId) {
    // ADMIN and SUPER_ADMIN have full sovereignty
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return { allowed: true, effectiveWarehouseId: requestedWarehouseId || null };
    }

    // Scoped non-admin users
    if (user.assignedWarehouseId) {
      if (requestedWarehouseId && String(requestedWarehouseId) !== String(user.assignedWarehouseId)) {
        return {
          allowed: false,
          error: 'Forbidden: You can only perform stock operations at your assigned warehouse branch.'
        };
      }
      return { allowed: true, effectiveWarehouseId: user.assignedWarehouseId };
    }

    // Unassigned non-admin users
    return { allowed: true, effectiveWarehouseId: requestedWarehouseId || null };
  }

  const warehouseA = new mongoose.Types.ObjectId();
  const warehouseB = new mongoose.Types.ObjectId();

  const scopedUser = {
    role: 'USER',
    assignedWarehouseId: warehouseA
  };

  const adminUser = {
    role: 'ADMIN',
    assignedWarehouseId: warehouseA
  };

  // Scoped user accessing their own branch -> ALLOWED
  const check1 = validateBranchAccess(scopedUser, warehouseA);
  assert.equal(check1.allowed, true);
  assert.equal(String(check1.effectiveWarehouseId), String(warehouseA));

  // Scoped user attempting to access another branch -> FORBIDDEN
  const check2 = validateBranchAccess(scopedUser, warehouseB);
  assert.equal(check2.allowed, false);
  assert.ok(check2.error.includes('Forbidden'));

  // Admin user accessing any branch -> ALLOWED
  const check3 = validateBranchAccess(adminUser, warehouseB);
  assert.equal(check3.allowed, true);
  assert.equal(String(check3.effectiveWarehouseId), String(warehouseB));
});
