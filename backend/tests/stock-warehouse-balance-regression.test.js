const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { buildStockBalanceMatch, stockBalancePipeline } = require('../src/services/stock.service');

const tenantId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
const warehouseA = new mongoose.Types.ObjectId();
const warehouseB = new mongoose.Types.ObjectId();

function balanceFor(entries, match) {
  const included = entries.filter(e =>
    String(e.tenantId) === String(match.tenantId) &&
    String(e.productId) === String(match.productId) &&
    e.isDeleted !== true &&
    (!match.warehouseId || String(e.warehouseId) === String(match.warehouseId))
  );
  return included.reduce((sum, e) => sum +
    (['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(e.type) ? e.quantity : -e.quantity), 0);
}

test('warehouse-specific stock match excludes other warehouse balances', () => {
  const match = buildStockBalanceMatch(productId, tenantId, warehouseA);
  const ledger = [
    { tenantId, productId, warehouseId: warehouseA, type: 'IN', quantity: 2 },
    { tenantId, productId, warehouseId: warehouseB, type: 'IN', quantity: 100 }
  ];
  assert.equal(String(match.warehouseId), String(warehouseA));
  assert.equal(balanceFor(ledger, match), 2);
  assert.ok(balanceFor(ledger, match) < 3, 'warehouse A cannot dispatch three units');
});

test('incoming transfer and adjustment increase stock; outgoing movements decrease it', () => {
  const match = buildStockBalanceMatch(productId, tenantId, warehouseA);
  const ledger = [
    { tenantId, productId, warehouseId: warehouseA, type: 'IN', quantity: 10 },
    { tenantId, productId, warehouseId: warehouseA, type: 'TRANSFER_IN', quantity: 5 },
    { tenantId, productId, warehouseId: warehouseA, type: 'ADJUSTMENT_IN', quantity: 3 },
    { tenantId, productId, warehouseId: warehouseA, type: 'OUT', quantity: 2 },
    { tenantId, productId, warehouseId: warehouseA, type: 'TRANSFER_OUT', quantity: 4 },
    { tenantId, productId, warehouseId: warehouseA, type: 'ADJUSTMENT_OUT', quantity: 1 }
  ];
  assert.equal(balanceFor(ledger, match), 11);
  const pipeline = stockBalancePipeline(match);
  assert.deepEqual(pipeline[1].$group.total.$sum.$cond[0].$in[1], ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']);
});

test('missing warehouse ID retains aggregate tenant-level behavior', () => {
  const match = buildStockBalanceMatch(productId, tenantId);
  assert.equal(Object.hasOwn(match, 'warehouseId'), false);
  assert.equal(balanceFor([
    { tenantId, productId, warehouseId: warehouseA, type: 'IN', quantity: 2 },
    { tenantId, productId, warehouseId: warehouseB, type: 'IN', quantity: 3 }
  ], match), 5);
});

test('rejects invalid warehouse IDs', () => {
  assert.throws(() => buildStockBalanceMatch(productId, tenantId, 'not-an-id'), /Invalid warehouse ID/);
});

test('tenant and soft-deleted records are excluded from warehouse balances', () => {
  const match = buildStockBalanceMatch(productId, tenantId, warehouseA);
  assert.equal(balanceFor([
    { tenantId, productId, warehouseId: warehouseA, type: 'IN', quantity: 4 },
    { tenantId: new mongoose.Types.ObjectId(), productId, warehouseId: warehouseA, type: 'IN', quantity: 50 },
    { tenantId, productId, warehouseId: warehouseA, type: 'IN', quantity: 20, isDeleted: true }
  ], match), 4);
});
