const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Item = require('../src/models/Item');
const PurchaseOrder = require('../src/models/PurchaseOrder');

test('Item - supports reorder fields in schema', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummySupplierId = new mongoose.Types.ObjectId();

  const item = new Item({
    name: 'MacBook Pro 16 M3 Max',
    salesPrice: 249900,
    purchasePrice: 210000,
    lowStockThreshold: 5,
    reorderQuantity: 15,
    preferredSupplierId: dummySupplierId,
    autoPoEnabled: true,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(item.name, 'MacBook Pro 16 M3 Max');
  assert.equal(item.lowStockThreshold, 5);
  assert.equal(item.reorderQuantity, 15);
  assert.equal(String(item.preferredSupplierId), String(dummySupplierId));
  assert.equal(item.autoPoEnabled, true);
  assert.equal(item.validateSync(), undefined);
});

test('Item - defaults reorderQuantity to 20 and autoPoEnabled to false', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const item = new Item({
    name: 'Standard USB-C Hub',
    salesPrice: 1999,
    purchasePrice: 800,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(item.reorderQuantity, 20);
  assert.equal(item.autoPoEnabled, false);
  assert.equal(item.preferredSupplierId, null);
  assert.equal(item.lowStockThreshold, 10);
});

test('Auto-PO - threshold check evaluates trigger condition', () => {
  function shouldTriggerAutoPo(item, currentStock) {
    if (!item.autoPoEnabled) return false;
    if (!item.preferredSupplierId) return false;
    const threshold = item.lowStockThreshold ?? 10;
    return currentStock <= threshold;
  }

  const supplierId = new mongoose.Types.ObjectId();
  const enabledItem = {
    autoPoEnabled: true,
    preferredSupplierId: supplierId,
    lowStockThreshold: 5,
    reorderQuantity: 20
  };

  assert.equal(shouldTriggerAutoPo(enabledItem, 3), true);  // Below threshold
  assert.equal(shouldTriggerAutoPo(enabledItem, 5), true);  // At threshold
  assert.equal(shouldTriggerAutoPo(enabledItem, 6), false); // Above threshold

  const disabledItem = { ...enabledItem, autoPoEnabled: false };
  assert.equal(shouldTriggerAutoPo(disabledItem, 2), false); // Disabled

  const noSupplierItem = { ...enabledItem, preferredSupplierId: null };
  assert.equal(shouldTriggerAutoPo(noSupplierItem, 2), false); // No supplier
});

test('Auto-PO - deduplication logic prevents duplicate draft within 7 days', () => {
  function isDuplicatePo(existingPoList, itemId, now = Date.now()) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return existingPoList.some(po => {
      const isRecent = (now - new Date(po.createdAt).getTime()) < sevenDaysMs;
      const isActiveStatus = ['draft', 'approved', 'sent'].includes(po.status);
      const containsItem = po.items.some(it => String(it.product) === String(itemId));
      return isRecent && isActiveStatus && containsItem;
    });
  }

  const itemId = new mongoose.Types.ObjectId();
  const otherItemId = new mongoose.Types.ObjectId();

  const activeRecentPo = [{
    status: 'draft',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    items: [{ product: itemId }]
  }];
  assert.equal(isDuplicatePo(activeRecentPo, itemId), true);
  assert.equal(isDuplicatePo(activeRecentPo, otherItemId), false);

  const oldPo = [{
    status: 'draft',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (> 7 days)
    items: [{ product: itemId }]
  }];
  assert.equal(isDuplicatePo(oldPo, itemId), false);

  const completedPo = [{
    status: 'received',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    items: [{ product: itemId }]
  }];
  assert.equal(isDuplicatePo(completedPo, itemId), false);
});
