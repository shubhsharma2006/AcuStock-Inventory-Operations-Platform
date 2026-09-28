const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../src/models/Notification');

test('Notification - buildUserQuery enforces role hierarchy and tenant isolation', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyTenantId = new mongoose.Types.ObjectId();

  // 1. Regular Manager query
  const managerQuery = Notification.buildUserQuery(dummyUserId, 'MANAGER', dummyTenantId);
  assert.equal(managerQuery.tenantId.toString(), dummyTenantId.toString());
  assert.ok(Array.isArray(managerQuery.$or));
  assert.equal(managerQuery.$or[0].userId.toString(), dummyUserId.toString());
  assert.deepEqual(managerQuery.$or[1].targetRole.$in, ['MANAGER', 'ALL']);

  // 2. Super Admin query includes ADMIN notifications
  const superAdminQuery = Notification.buildUserQuery(dummyUserId, 'SUPER_ADMIN', dummyTenantId);
  assert.equal(superAdminQuery.tenantId.toString(), dummyTenantId.toString());
  assert.deepEqual(superAdminQuery.$or[1].targetRole.$in, ['SUPER_ADMIN', 'ADMIN', 'ALL']);

  // 3. User without tenantId
  const globalQuery = Notification.buildUserQuery(dummyUserId, 'USER');
  assert.equal(globalQuery.tenantId, undefined);
  assert.deepEqual(globalQuery.$or[1].targetRole.$in, ['USER', 'ALL']);
});

test('Notification - Schema validates priorities and categories', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  for (const priority of validPriorities) {
    const doc = new Notification({
      type: 'stock_in',
      title: 'Incoming Stock Received',
      message: 'Warehouse 1 received 50 units',
      priority,
      category: 'STOCK',
      targetRole: 'ADMIN',
      userId: dummyUserId,
      tenantId: dummyTenantId
    });
    const error = doc.validateSync();
    assert.equal(error, undefined, `Validation failed for priority: ${priority}`);
  }

  // Invalid priority fails validation
  const invalidDoc = new Notification({
    type: 'stock_in',
    title: 'Test',
    message: 'Test message',
    priority: 'SUPER_URGENT',
    category: 'STOCK'
  });
  const invalidError = invalidDoc.validateSync();
  assert.ok(invalidError, 'Expected validation error for invalid priority');
});

test('Notification - Link and metadata support deep navigation', () => {
  const doc = new Notification({
    type: 'low_stock',
    title: 'Critical Low Stock',
    message: 'Product SKU-990 below threshold',
    link: '/dashboard/admin/products',
    metadata: {
      productId: 'item_123',
      currentStock: 2,
      threshold: 10
    }
  });

  const error = doc.validateSync();
  assert.equal(error, undefined);
  assert.equal(doc.link, '/dashboard/admin/products');
  assert.equal(doc.metadata.currentStock, 2);
  assert.equal(doc.isRead, false); // defaults to unread
});
