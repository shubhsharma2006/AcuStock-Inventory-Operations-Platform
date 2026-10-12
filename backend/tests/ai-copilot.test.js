'use strict';

/**
 * AcuStock Phase 1 AI Copilot & AcuBot Core Tests
 * 
 * Verifies:
 * - SecurityContext invariant (LLM never controls tenancy or roles)
 * - Inventory & Order function calling tools
 * - Confirm-Before-Commit DRAFT PO creation pattern
 * - AuditLog tracking for AI actions
 * - AcuBot Agent reasoning & fallback engine
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { SecurityContext } = require('../src/ai/core/context');
const { executeTool } = require('../src/ai/core/tool-registry');
const agent = require('../src/ai/core/agent');
const Item = require('../src/models/Item');
const InventoryLot = require('../src/models/InventoryLot');
const SalesOrder = require('../src/models/SalesOrder');
const PurchaseOrder = require('../src/models/PurchaseOrder');
const Warehouse = require('../src/models/Warehouse');
const AuditLog = require('../src/models/AuditLog');

const TEST_DB = 'mongodb://localhost:27017/acustock_ai_test?replicaSet=rs0&directConnection=true';

describe('AcuStock Phase 1: AI Copilot & AcuBot Core', () => {
  let tenantId;
  let adminUserId;
  let regularUserId;
  let warehouseId;
  let testItem;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB);
    }

    tenantId = new mongoose.Types.ObjectId();
    adminUserId = new mongoose.Types.ObjectId();
    regularUserId = new mongoose.Types.ObjectId();
    warehouseId = new mongoose.Types.ObjectId();

    // Create test warehouse
    await Warehouse.create({
      _id: warehouseId,
      name: 'Main Distribution Hub',
      code: 'WH-TEST-01',
      tenantId,
      createdBy: adminUserId,
      isActive: true
    });

    // Create test item (BATCH tracked)
    testItem = await Item.create({
      name: 'Neural Sensor Kit X1',
      sku: 'SKU-NSK1',
      salesPrice: 150,
      purchasePrice: 90,
      mrp: 180,
      trackingMode: 'BATCH',
      lowStockThreshold: 15,
      tenantId,
      createdBy: adminUserId
    });

    // Create test lot
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 20); // expiring in 20 days
    await InventoryLot.create({
      tenantId,
      productId: testItem._id,
      warehouseId,
      lotNumber: 'LOT-AI-2026',
      initialQty: 50,
      remainingQty: 8, // below threshold of 15
      expiryDate,
      status: 'ACTIVE'
    });

    // Create test Sales Order with backorder
    await SalesOrder.create({
      soNumber: 'SO-AI-9001',
      tenantId,
      buyer: { name: 'Acme Robotics', email: 'procurement@acme.com' },
      items: [{
        productId: testItem._id,
        quantity: 25,
        unitPrice: 150,
        lineTotal: 3750,
        reservedQty: 8,
        fulfilledQty: 8,
        backorderedQty: 17,
        isBackordered: true
      }],
      status: 'partially_fulfilled',
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      totalValue: 3750,
      createdBy: adminUserId
    });
  });

  after(async () => {
    // Cleanup test collections
    await Item.deleteMany({ tenantId });
    await InventoryLot.deleteMany({ tenantId });
    await SalesOrder.deleteMany({ tenantId });
    await PurchaseOrder.deleteMany({ tenantId });
    await Warehouse.deleteMany({ tenantId });
    await AuditLog.deleteMany({ tenantId });
    await mongoose.disconnect();
  });

  test('1. SecurityContext: Enforces frozen tenantId and denies unauthorized overrides', () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN', name: 'Admin Tester' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    assert.equal(context.tenantId.toString(), tenantId.toString());
    assert.equal(context.role, 'ADMIN');
    assert.equal(context.isAtLeastManager(), true);

    // Context must be frozen
    assert.throws(() => {
      context.tenantId = new mongoose.Types.ObjectId();
    }, /Cannot assign to read only property/);
  });

  test('2. Inventory Tools: queryStockLevel resolves products and active batches', async () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    const result = await executeTool('queryStockLevel', { skuOrName: 'SKU-NSK1' }, context);
    assert.equal(result.found, true);
    assert.equal(result.count, 1);
    const prod = result.products[0];
    assert.equal(prod.sku, 'SKU-NSK1');
    assert.equal(prod.trackingMode, 'BATCH');
    assert.equal(prod.activeBatches?.length, 1);
    assert.equal(prod.activeBatches[0].batchNumber, 'LOT-AI-2026');
  });

  test('3. Inventory Tools: checkExpiringLots identifies lots expiring within window', async () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    const result = await executeTool('checkExpiringLots', { daysAhead: 30 }, context);
    assert.equal(result.found, true);
    assert.ok(result.count >= 1);
    const lot = result.lots.find(l => l.batchNumber === 'LOT-AI-2026');
    assert.ok(lot);
    assert.equal(lot.availableQty, 8);
    assert.ok(lot.daysRemaining <= 21);
  });

  test('4. Orders Tools: getOrderStatus returns fulfillment breakdown and backorderedQty', async () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    const result = await executeTool('getOrderStatus', { orderNumber: 'SO-AI-9001' }, context);
    assert.equal(result.found, true);
    assert.equal(result.soNumber, 'SO-AI-9001');
    assert.equal(result.fulfillmentStatus, 'PARTIALLY_FULFILLED');
    assert.equal(result.items[0].backorderedQty, 17);
  });

  test('5. Orders Tools: draftPurchaseOrder enforces RBAC and Confirm-Before-Commit', async () => {
    // Regular USER must be rejected
    const regUser = { _id: regularUserId, role: 'USER' };
    const userContext = new SecurityContext({ user: regUser, tenantId });

    const denied = await executeTool('draftPurchaseOrder', {
      supplierNameOrId: 'Acme Vendor',
      items: [{ sku: 'SKU-NSK1', quantity: 20 }]
    }, userContext);
    assert.ok(denied.error?.includes('Permission Denied'));

    // MANAGER / ADMIN must succeed in creating DRAFT
    const adminUser = { _id: adminUserId, role: 'ADMIN', name: 'Admin Tester' };
    const adminContext = new SecurityContext({ user: adminUser, tenantId });

    const draftResult = await executeTool('draftPurchaseOrder', {
      supplierNameOrId: 'Acme Vendor',
      items: [{ sku: 'SKU-NSK1', quantity: 20 }]
    }, adminContext);

    assert.equal(draftResult.success, true);
    assert.equal(draftResult.status, 'DRAFT');
    assert.equal(draftResult.items[0].quantity, 20);

    // Verify PO in database is in 'draft' status
    const poInDb = await PurchaseOrder.findById(draftResult.poId);
    assert.equal(poInDb.status, 'draft');
    assert.equal(poInDb.tenantId.toString(), tenantId.toString());

    // Verify AuditLog entry was written
    const audit = await AuditLog.findOne({
      tenantId,
      action: 'AI_DRAFT_PO_CREATED'
    });
    assert.ok(audit);
    assert.equal(audit.performedBy.toString(), adminUserId.toString());
  });

  test('6. AcuBot Agent: Executes conversational reasoning and tool calls', async () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN', name: 'Admin Tester' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    // Test query for expiring batches
    const response = await agent.chat({
      prompt: 'Show me any batches expiring within the next 30 days',
      securityContext: context
    });

    assert.ok(response.text);
    assert.ok(response.text.includes('Expiring') || response.text.includes('LOT-AI-2026') || response.text.includes('fresh'));
    assert.ok(response.executedTools.length > 0);
  });

  test('7. AcuBot Agent: Executes comprehensive inventory health analysis', async () => {
    const adminUser = { _id: adminUserId, role: 'ADMIN', name: 'Admin Tester' };
    const context = new SecurityContext({ user: adminUser, tenantId });

    // Test comprehensive analysis prompt
    const response = await agent.chat({
      prompt: 'Give me a full inventory health analysis',
      securityContext: context
    });

    assert.ok(response.text);
    assert.ok(response.text.includes('Inventory Health Analysis'));
    assert.ok(response.text.includes('Health Score'));
    assert.ok(response.text.includes('Catalog Breakdown'));
    assert.ok(response.executedTools.some(t => t.name === 'analyzeInventoryHealth'));

    // Test capability question (non-canned explanation)
    const capResponse = await agent.chat({
      prompt: 'is this only for these 4 question?',
      securityContext: context
    });
    assert.ok(capResponse.text);
    assert.ok(capResponse.text.includes('not limited to just canned questions'));
  });
});
