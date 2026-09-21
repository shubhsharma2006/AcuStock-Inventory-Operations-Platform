const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Warehouse = require('../src/models/Warehouse');
const StockTransfer = require('../src/models/StockTransfer');
const StockLedger = require('../src/models/StockLedger');

test('Warehouse - model schema validation', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const wh = new Warehouse({
    name: '  Central Regional Hub  ',
    code: 'crh-01',
    address: {
      street: '100 Industrial Parkway',
      city: 'Pune',
      state: 'Maharashtra',
      zipCode: '411001'
    },
    contactPerson: 'Suresh Patil',
    phone: '+91 98765 43210',
    email: 'suresh@central.acustock.com',
    capacity: 50000,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(wh.name, 'Central Regional Hub');
  assert.equal(wh.code, 'CRH-01');
  assert.equal(wh.isDefault, false);
  assert.equal(wh.isActive, true);
  assert.equal(wh.validateSync(), undefined);
});

test('Warehouse - rejects missing name or code', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const wh = new Warehouse({
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  const err = wh.validateSync();
  assert.ok(err);
  assert.ok(err.errors.name);
  assert.ok(err.errors.code);
});

test('StockTransfer - model schema validation & status lifecycle', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyWh1 = new mongoose.Types.ObjectId();
  const dummyWh2 = new mongoose.Types.ObjectId();
  const dummyProduct = new mongoose.Types.ObjectId();

  const transfer = new StockTransfer({
    transferNumber: 'TRF-000101',
    fromWarehouse: dummyWh1,
    toWarehouse: dummyWh2,
    items: [{
      product: dummyProduct,
      quantity: 50,
      serialNumbers: ['SN-101', 'SN-102']
    }],
    requestedBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(transfer.status, 'DRAFT');
  assert.equal(transfer.transferNumber, 'TRF-000101');
  assert.equal(transfer.items.length, 1);
  assert.equal(transfer.items[0].quantity, 50);
  assert.equal(transfer.validateSync(), undefined);
});

test('StockTransfer - accepts valid status states', () => {
  const validStatuses = ['DRAFT', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyWh1 = new mongoose.Types.ObjectId();
  const dummyWh2 = new mongoose.Types.ObjectId();
  const dummyProduct = new mongoose.Types.ObjectId();

  for (const status of validStatuses) {
    const transfer = new StockTransfer({
      transferNumber: 'TRF-000200',
      fromWarehouse: dummyWh1,
      toWarehouse: dummyWh2,
      status,
      items: [{
        product: dummyProduct,
        quantity: 10
      }],
      requestedBy: dummyUserId,
      tenantId: dummyTenantId
    });
    assert.equal(transfer.validateSync(), undefined, `Status ${status} should be valid`);
  }
});

test('StockTransfer - rejects invalid status state', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyWh1 = new mongoose.Types.ObjectId();
  const dummyWh2 = new mongoose.Types.ObjectId();
  const dummyProduct = new mongoose.Types.ObjectId();

  const transfer = new StockTransfer({
    transferNumber: 'TRF-000300',
    fromWarehouse: dummyWh1,
    toWarehouse: dummyWh2,
    status: 'INVALID_STATUS',
    items: [{
      product: dummyProduct,
      quantity: 10
    }],
    requestedBy: dummyUserId,
    tenantId: dummyTenantId
  });

  const err = transfer.validateSync();
  assert.ok(err);
  assert.ok(err.errors.status);
});

test('StockLedger - accepts TRANSFER_OUT and TRANSFER_IN entries with warehouseId and transferId', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyWh = new mongoose.Types.ObjectId();
  const dummyTrf = new mongoose.Types.ObjectId();
  const dummyProduct = new mongoose.Types.ObjectId();

  const outEntry = new StockLedger({
    productId: dummyProduct,
    warehouseId: dummyWh,
    transferId: dummyTrf,
    type: 'TRANSFER_OUT',
    quantity: 25,
    createdBy: dummyUserId,
    role: 'ADMIN',
    tenantId: dummyTenantId
  });
  assert.equal(outEntry.validateSync(), undefined);

  const inEntry = new StockLedger({
    productId: dummyProduct,
    warehouseId: dummyWh,
    transferId: dummyTrf,
    type: 'TRANSFER_IN',
    quantity: 25,
    createdBy: dummyUserId,
    role: 'ADMIN',
    tenantId: dummyTenantId
  });
  assert.equal(inEntry.validateSync(), undefined);
});
