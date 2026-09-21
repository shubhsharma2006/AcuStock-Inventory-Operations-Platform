const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Item = require('../src/models/Item');
const Counter = require('../src/models/Counter');

test('Product Master - Item model has all required enterprise fields', () => {
  const schema = Item.schema.paths;
  
  assert.ok(schema.sku, 'sku field must exist');
  assert.ok(schema.barcode, 'barcode field must exist');
  assert.ok(schema.barcodeFormat, 'barcodeFormat field must exist');
  assert.ok(schema.uom, 'uom field must exist');
  assert.ok(schema.taxRate, 'taxRate field must exist');
  assert.ok(schema.taxType, 'taxType field must exist');
  assert.ok(schema.category, 'category field must exist');
  assert.ok(schema.brand, 'brand field must exist');
  assert.ok(schema.description, 'description field must exist');
  assert.ok(schema.imageUrl, 'imageUrl field must exist');
});

test('Product Master - Default values are properly set', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyTenantId = new mongoose.Types.ObjectId();

  const item = new Item({
    name: 'Industrial Valve X1',
    salesPrice: 1200,
    purchasePrice: 900,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(item.uom, 'PCS');
  assert.equal(item.taxRate, 0);
  assert.equal(item.taxType, 'GST');
  assert.equal(item.category, 'General');
  assert.equal(item.barcodeFormat, 'CODE128');
  assert.equal(item.lowStockThreshold, 10);
});

test('Product Master - SKU is normalized to uppercase and trimmed', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyTenantId = new mongoose.Types.ObjectId();

  const item = new Item({
    name: 'Precision Gearbox',
    sku: '  gear-box-99  ',
    salesPrice: 5000,
    purchasePrice: 3500,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(item.sku, 'GEAR-BOX-99');
});

test('Product Master - UoM enum allows standard units', () => {
  const validUoms = ['PCS', 'BOX', 'KG', 'MTR', 'LTR', 'SET', 'UNIT'];
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyTenantId = new mongoose.Types.ObjectId();

  for (const u of validUoms) {
    const item = new Item({
      name: 'Item ' + u,
      uom: u,
      salesPrice: 100,
      purchasePrice: 80,
      createdBy: dummyUserId,
      tenantId: dummyTenantId
    });
    const err = item.validateSync();
    assert.equal(err, undefined, `UoM ${u} should be valid`);
  }
});

test('Product Master - Counter model accepts SKU and TRANSFER types', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();

  const skuCounter = new Counter({
    tenantId: dummyTenantId,
    type: 'SKU'
  });
  assert.equal(skuCounter.validateSync(), undefined);

  const trfCounter = new Counter({
    tenantId: dummyTenantId,
    type: 'TRANSFER'
  });
  assert.equal(trfCounter.validateSync(), undefined);
});
