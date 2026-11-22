const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const backupService = require('../src/services/backup.service');
const Item = require('../src/models/Item');
const Warehouse = require('../src/models/Warehouse');
const StockLedger = require('../src/models/StockLedger');

const uri = process.env.TRANSFER_TEST_MONGO_URI;

test('Disaster Recovery Drill: Interrupted replacement restore rolls back atomically and isolates tenants', {
  skip: uri ? false : 'Set TRANSFER_TEST_MONGO_URI to a test replica set'
}, async (t) => {
  const objectId = () => new mongoose.Types.ObjectId();
  const dbName = 'acustock_restore_drill_' + objectId();

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 3000 });

  t.after(async () => {
    try {
      await mongoose.connection.db.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });

  await Promise.all([
    Item.init(),
    Warehouse.init(),
    StockLedger.init()
  ]);

  const tenantA = objectId();
  const tenantB = objectId();
  const userAdminA = { _id: objectId(), name: 'Admin A', role: 'ADMIN' };
  const userAdminB = { _id: objectId(), name: 'Admin B', role: 'ADMIN' };

  // 1. Seed initial data for Tenant A
  const whA = await Warehouse.create({
    name: 'Tenant A Primary Warehouse',
    code: 'WH-A1',
    createdBy: userAdminA._id,
    tenantId: tenantA
  });

  const itemA1 = await Item.create({
    name: 'Industrial Valve A1',
    sku: 'VALVE-A1',
    category: 'Hardware',
    purchasePrice: 150,
    salesPrice: 250,
    createdBy: userAdminA._id,
    tenantId: tenantA
  });

  const itemA2 = await Item.create({
    name: 'Steel Coupling A2',
    sku: 'STEEL-A2',
    category: 'Hardware',
    purchasePrice: 80,
    salesPrice: 140,
    createdBy: userAdminA._id,
    tenantId: tenantA
  });

  const ledgerA1 = await StockLedger.create({
    productId: itemA1._id,
    warehouseId: whA._id,
    type: 'IN',
    quantity: 100,
    createdBy: userAdminA._id,
    role: 'ADMIN',
    tenantId: tenantA
  });

  // 2. Seed initial data for Tenant B (control tenant to verify strict multi-tenant isolation)
  const whB = await Warehouse.create({
    name: 'Tenant B Logistics Hub',
    code: 'WH-B1',
    createdBy: userAdminB._id,
    tenantId: tenantB
  });

  const itemB1 = await Item.create({
    name: 'Electronics Board B1',
    sku: 'BOARD-B1',
    category: 'Electronics',
    purchasePrice: 300,
    salesPrice: 500,
    createdBy: userAdminB._id,
    tenantId: tenantB
  });

  const ledgerB1 = await StockLedger.create({
    productId: itemB1._id,
    warehouseId: whB._id,
    type: 'IN',
    quantity: 50,
    createdBy: userAdminB._id,
    role: 'ADMIN',
    tenantId: tenantB
  });

  // 3. Create verified v2 backup for Tenant A
  const backup = await backupService.createBackup({
    tenantId: tenantA,
    initiatedBy: userAdminA,
    type: 'TENANT',
    description: 'Pre-interruption golden snapshot'
  });

  t.after(() => {
    try {
      backupService.deleteBackup(backup.id, { tenantId: tenantA, userRole: 'ADMIN' });
    } catch (_) {}
  });

  assert.equal(backup.tenantId, String(tenantA));
  assert.ok(backup.id);

  // 4. Mutate Tenant A state post-backup (add Item A3 and extra stock ledger entry)
  const itemA3 = await Item.create({
    name: 'Post-Backup Flange A3',
    sku: 'FLANGE-A3',
    category: 'Hardware',
    purchasePrice: 95,
    salesPrice: 160,
    createdBy: userAdminA._id,
    tenantId: tenantA
  });

  const ledgerA2 = await StockLedger.create({
    productId: itemA3._id,
    warehouseId: whA._id,
    type: 'IN',
    quantity: 25,
    createdBy: userAdminA._id,
    role: 'ADMIN',
    tenantId: tenantA
  });

  // Verify Tenant A has 3 items and 2 ledger rows before drill
  assert.equal(await Item.countDocuments({ tenantId: tenantA }), 3);
  assert.equal(await StockLedger.countDocuments({ tenantId: tenantA }), 2);

  // 5. DRILL PART 1: Interrupted Replacement Restore (Simulated Failure Mid-Transaction)
  // We hook StockLedger.insertMany to throw mid-stream after Item records have already been replaced
  const originalStockLedgerInsertMany = StockLedger.insertMany;
  let simulatedErrorTriggered = false;

  StockLedger.insertMany = async function (docs, options) {
    if (options && options.session) {
      simulatedErrorTriggered = true;
      throw new Error('SIMULATED_TRANSACTION_FAILURE: Crash midway through collection replacement');
    }
    return originalStockLedgerInsertMany.apply(this, arguments);
  };

  try {
    await assert.rejects(
      async () => {
        await backupService.restoreBackup(backup.id, {
          targetTenantId: tenantA,
          dropExisting: true,
          user: userAdminA
        });
      },
      /SIMULATED_TRANSACTION_FAILURE/
    );
  } finally {
    StockLedger.insertMany = originalStockLedgerInsertMany;
  }

  assert.equal(simulatedErrorTriggered, true, 'Interruption hook must execute during transaction');

  // Verify Atomic Rollback Invariant:
  // Tenant A's state must be completely rolled back to its pre-restore state (3 items and 2 ledger rows)
  const itemsAfterRollback = await Item.find({ tenantId: tenantA }).sort({ sku: 1 }).lean();
  assert.equal(itemsAfterRollback.length, 3, 'Tenant A post-backup items must be preserved after abort');
  assert.ok(itemsAfterRollback.some(i => i.sku === 'FLANGE-A3'), 'Post-backup item A3 must still exist');

  const ledgersAfterRollback = await StockLedger.find({ tenantId: tenantA }).lean();
  assert.equal(ledgersAfterRollback.length, 2, 'Tenant A stock ledger entries must remain intact');

  // Verify Tenant Isolation Invariant during interruption:
  // Tenant B must be completely untouched
  const tenantBItems = await Item.find({ tenantId: tenantB }).lean();
  assert.equal(tenantBItems.length, 1);
  assert.equal(tenantBItems[0].sku, 'BOARD-B1');

  const tenantBLedgers = await StockLedger.find({ tenantId: tenantB }).lean();
  assert.equal(tenantBLedgers.length, 1);
  assert.equal(tenantBLedgers[0].quantity, 50);

  // 6. DRILL PART 2: Clean Replacement Restore & Recovery Reconciliation
  const startTime = Date.now();
  const restoreResult = await backupService.restoreBackup(backup.id, {
    targetTenantId: tenantA,
    dropExisting: true,
    user: userAdminA
  });
  const recoveryDurationMs = Date.now() - startTime;

  assert.equal(restoreResult.success, true);
  assert.equal(restoreResult.targetTenantId, tenantA);

  // Verify Tenant A was cleanly reset to backup state (2 items, 1 ledger, post-backup item A3 wiped)
  const reconciledItemsA = await Item.find({ tenantId: tenantA }).sort({ sku: 1 }).lean();
  assert.equal(reconciledItemsA.length, 2, 'Tenant A must have exactly the 2 backup items');
  assert.deepEqual(reconciledItemsA.map(i => i.sku), ['STEEL-A2', 'VALVE-A1']);

  const reconciledLedgerA = await StockLedger.find({ tenantId: tenantA }).lean();
  assert.equal(reconciledLedgerA.length, 1, 'Tenant A must have exactly 1 ledger entry');
  assert.equal(reconciledLedgerA[0].quantity, 100);

  // Verify Tenant B remained completely unaffected after successful restore
  const finalTenantBItems = await Item.find({ tenantId: tenantB }).lean();
  assert.equal(finalTenantBItems.length, 1);
  assert.equal(finalTenantBItems[0].sku, 'BOARD-B1');

  const finalTenantBLedgers = await StockLedger.find({ tenantId: tenantB }).lean();
  assert.equal(finalTenantBLedgers.length, 1);
  assert.equal(finalTenantBLedgers[0].quantity, 50);

  // Measure and assert recovery performance
  t.diagnostic(`[Disaster Recovery Benchmark] Tenant recovery completed in ${recoveryDurationMs}ms (RTO threshold < 10000ms)`);
  assert.ok(recoveryDurationMs < 10000, `Recovery time must be < 10s (was ${recoveryDurationMs}ms)`);
});
