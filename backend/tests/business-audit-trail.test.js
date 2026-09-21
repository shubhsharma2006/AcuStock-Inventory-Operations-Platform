const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AuditLog = require('../src/models/AuditLog');
const { logBusinessEvent } = require('../src/utils/auditHelper');

test('AuditLog - schema validates business and inventory actions', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyItemId = new mongoose.Types.ObjectId();

  const businessActions = [
    'ITEM_CREATED',
    'ITEM_UPDATED',
    'ITEM_DELETED',
    'ITEM_IMPORTED',
    'STOCK_IN',
    'STOCK_OUT',
    'STOCK_ADJUSTED',
    'STOCK_TRANSFER',
    'PO_CREATED',
    'PO_RECEIVED',
    'PO_STATUS_CHANGED',
    'SO_CREATED',
    'SO_DISPATCHED',
    'SO_STATUS_CHANGED',
    'COMPANY_CREATED',
    'COMPANY_UPDATED',
    'COMPANY_DELETED',
    'SETTING_CHANGED',
    'PERMISSION_UPDATED'
  ];

  for (const action of businessActions) {
    const log = new AuditLog({
      action,
      entityType: 'Item',
      entityId: dummyItemId,
      performedBy: dummyUserId,
      performedByName: 'Test Admin',
      performedByRole: 'ADMIN',
      changes: {
        summary: `Action ${action} performed`
      },
      tenantId: dummyTenantId
    });

    const validationError = log.validateSync();
    assert.equal(validationError, undefined, `Validation failed for action: ${action}`);
  }
});

test('AuditLog - schema accepts entity references and before/after change tracking', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyPoId = new mongoose.Types.ObjectId();

  const log = new AuditLog({
    action: 'PO_STATUS_CHANGED',
    entityType: 'PurchaseOrder',
    entityId: dummyPoId,
    performedBy: dummyUserId,
    performedByName: 'Procurement Lead',
    performedByRole: 'MANAGER',
    changes: {
      before: { status: 'draft', totalAmount: 15000 },
      after: { status: 'approved', totalAmount: 15000 },
      summary: 'Purchase order approved for procurement'
    },
    severity: 'INFO',
    tenantId: dummyTenantId
  });

  assert.equal(log.validateSync(), undefined);
  assert.equal(log.entityType, 'PurchaseOrder');
  assert.equal(log.changes.before.status, 'draft');
  assert.equal(log.changes.after.status, 'approved');
  assert.equal(log.changes.summary, 'Purchase order approved for procurement');
});

test('AuditLog - schema rejects invalid action enum', () => {
  const log = new AuditLog({
    action: 'INVALID_BUSINESS_ACTION',
    entityType: 'Item'
  });

  const err = log.validateSync();
  assert.ok(err);
  assert.ok(err.errors.action);
});

test('AuditLog - schema rejects invalid entityType enum', () => {
  const log = new AuditLog({
    action: 'ITEM_CREATED',
    entityType: 'UnknownCollection'
  });

  const err = log.validateSync();
  assert.ok(err);
  assert.ok(err.errors.entityType);
});

test('auditHelper.logBusinessEvent - extracts request context safely and never throws', async () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyItemId = new mongoose.Types.ObjectId();

  const mockReq = {
    userId: dummyUserId,
    user: {
      _id: dummyUserId,
      name: 'Operations Manager',
      role: 'MANAGER',
      tenantId: dummyTenantId
    },
    tenantId: dummyTenantId,
    ip: '192.168.1.100',
    headers: {
      'user-agent': 'Mozilla/5.0 AcuStockClient/1.0'
    },
    get(header) {
      return this.headers[header.toLowerCase()];
    }
  };

  // Mock AuditLog.logEvent
  const originalLogEvent = AuditLog.logEvent;
  let loggedPayload = null;

  AuditLog.logEvent = async (data) => {
    loggedPayload = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };

  try {
    const result = await logBusinessEvent({
      req: mockReq,
      action: 'STOCK_IN',
      entityType: 'Item',
      entityId: dummyItemId,
      changes: {
        summary: 'Stock IN: 50 units received'
      },
      details: {
        quantity: 50,
        supplier: 'ABC Supplies'
      }
    });

    assert.ok(result);
    assert.equal(loggedPayload.action, 'STOCK_IN');
    assert.equal(loggedPayload.entityType, 'Item');
    assert.equal(loggedPayload.entityId, dummyItemId);
    assert.equal(loggedPayload.performedBy, dummyUserId);
    assert.equal(loggedPayload.performedByName, 'Operations Manager');
    assert.equal(loggedPayload.performedByRole, 'MANAGER');
    assert.equal(loggedPayload.tenantId, dummyTenantId);
    assert.equal(loggedPayload.ipAddress, '192.168.1.100');
    assert.equal(loggedPayload.userAgent, 'Mozilla/5.0 AcuStockClient/1.0');
    assert.equal(loggedPayload.changes.summary, 'Stock IN: 50 units received');
  } finally {
    AuditLog.logEvent = originalLogEvent;
  }
});

test('auditHelper.logBusinessEvent - handles null req or missing fields gracefully', async () => {
  const originalLogEvent = AuditLog.logEvent;
  let loggedPayload = null;

  AuditLog.logEvent = async (data) => {
    loggedPayload = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };

  try {
    const result = await logBusinessEvent({
      req: null,
      action: 'SETTING_CHANGED',
      performedByRole: 'SYSTEM'
    });

    assert.ok(result);
    assert.equal(loggedPayload.action, 'SETTING_CHANGED');
    assert.equal(loggedPayload.performedByName, 'SYSTEM');
    assert.equal(loggedPayload.performedByRole, 'SYSTEM');
    assert.equal(loggedPayload.tenantId, null);
  } finally {
    AuditLog.logEvent = originalLogEvent;
  }
});
