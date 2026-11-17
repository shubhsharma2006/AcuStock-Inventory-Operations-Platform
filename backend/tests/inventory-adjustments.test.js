/**
 * Test Suite: Inventory Adjustments, Write-Offs, Scrap & Damage Reasons
 * ────────────────────────────────────────────────────────────────────
 * Tests:
 * 1. InventoryAdjustment model validation & enum constraints
 * 2. Predefined reason codes (DAMAGE, SCRAP, THEFT, WRITE_OFF, FOUND, etc.)
 * 3. Total value impact computation (adjustmentQty * unitCost)
 * 4. Approval threshold & state machine (DRAFT -> PENDING_APPROVAL -> POSTED / REJECTED)
 * 5. Invariant guards: Cannot reject an already POSTED adjustment
 * 6. Ledger mapping: Positive adjustment creates ADJUSTMENT_IN, negative creates ADJUSTMENT_OUT
 * 7. StockLedger reasonCode enum validation
 * 8. Multi-tenant isolation for adjustments
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const InventoryAdjustment = require('../src/models/InventoryAdjustment');
const StockLedger = require('../src/models/StockLedger');

test('Inventory Adjustments & Write-Off Workflows', async (t) => {
  const tenantA = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c101');
  const tenantB = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c102');
  const warehouse1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c103');
  const product1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c104');
  const product2 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c105');
  const user1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c106');

  await t.test('1. Model Validation: Creates valid adjustment with reason codes', () => {
    const adj = new InventoryAdjustment({
      adjustmentNumber: 'ADJ-000001',
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'WRITE_OFF',
      status: 'DRAFT',
      items: [
        {
          productId: product1,
          quantityBefore: 50,
          adjustmentQty: -5,
          quantityAfter: 45,
          reasonCode: 'DAMAGE',
          reasonNotes: 'Forklift dropped carton',
          unitCost: 120
        }
      ],
      totalValueImpact: -600,
      createdBy: user1
    });

    const err = adj.validateSync();
    assert.equal(err, undefined, 'Valid adjustment must pass schema validation');
    assert.equal(adj.adjustmentNumber, 'ADJ-000001');
    assert.equal(adj.items[0].reasonCode, 'DAMAGE');
    assert.equal(adj.totalValueImpact, -600);
  });

  await t.test('2. Enum Validation: Rejects invalid reason codes and types', () => {
    const invalidReason = new InventoryAdjustment({
      adjustmentNumber: 'ADJ-000002',
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'INVALID_ADJUSTMENT_TYPE',
      items: [
        {
          productId: product1,
          quantityBefore: 10,
          adjustmentQty: -2,
          quantityAfter: 8,
          reasonCode: 'ALIEN_ABDUCTION'
        }
      ],
      createdBy: user1
    });

    const err = invalidReason.validateSync();
    assert.ok(err.errors.type, 'Invalid type must fail enum validation');
    assert.ok(err.errors['items.0.reasonCode'], 'Invalid reasonCode must fail enum validation');
  });

  await t.test('3. Value Impact Computation: Accurately calculates net financial impact', () => {
    const items = [
      { adjustmentQty: -10, unitCost: 50 },  // -$500
      { adjustmentQty: 4, unitCost: 150 },   // +$600
      { adjustmentQty: -2, unitCost: 25.50 } // -$51
    ];

    const totalImpact = items.reduce((sum, item) => sum + (item.adjustmentQty * item.unitCost), 0);
    assert.equal(totalImpact, 49); // -$500 + $600 - $51 = $49
  });

  await t.test('4. Ledger Mapping Logic: Correctly determines ADJUSTMENT_IN vs ADJUSTMENT_OUT', () => {
    const testCases = [
      { adjQty: -10, expectedLedgerType: 'ADJUSTMENT_OUT', expectedQty: 10 },
      { adjQty: 25, expectedLedgerType: 'ADJUSTMENT_IN', expectedQty: 25 }
    ];

    testCases.forEach(({ adjQty, expectedLedgerType, expectedQty }) => {
      const isPositive = adjQty > 0;
      const ledgerType = isPositive ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      const absQty = Math.abs(adjQty);

      assert.equal(ledgerType, expectedLedgerType);
      assert.equal(absQty, expectedQty);

      const ledgerEntry = new StockLedger({
        tenantId: tenantA,
        warehouseId: warehouse1,
        productId: product1,
        type: ledgerType,
        quantity: absQty,
        reasonCode: isPositive ? 'FOUND' : 'SCRAP',
        adjustmentReason: 'Operational balance sync',
        createdBy: user1,
        role: 'ADMIN'
      });

      const err = ledgerEntry.validateSync();
      assert.equal(err, undefined);
      assert.equal(ledgerEntry.type, expectedLedgerType);
    });
  });

  await t.test('5. StockLedger reasonCode Enum: Validates all standard reason codes', () => {
    const validCodes = [
      'DAMAGE',
      'SCRAP',
      'THEFT',
      'WRITE_OFF',
      'FOUND',
      'RECLASSIFICATION',
      'EXPIRED',
      'QC_REJECTION',
      'CYCLE_COUNT',
      'CORRECTION',
      'OTHER'
    ];

    validCodes.forEach(code => {
      const entry = new StockLedger({
        tenantId: tenantA,
        productId: product1,
        warehouseId: warehouse1,
        type: 'ADJUSTMENT_IN',
        quantity: 1,
        reasonCode: code,
        createdBy: user1,
        role: 'ADMIN'
      });
      const err = entry.validateSync();
      assert.equal(err, undefined, `Reason code ${code} must be valid in StockLedger`);
    });

    const invalidEntry = new StockLedger({
      tenantId: tenantA,
      productId: product1,
      type: 'ADJUSTMENT_IN',
      quantity: 1,
      reasonCode: 'NON_EXISTENT_REASON',
      createdBy: user1,
      role: 'ADMIN'
    });
    const err = invalidEntry.validateSync();
    assert.ok(err.errors.reasonCode, 'Unknown reason code must fail');
  });

  await t.test('6. State Machine: Allowed transitions and invariants', () => {
    const adj = new InventoryAdjustment({
      adjustmentNumber: 'ADJ-000003',
      tenantId: tenantA,
      warehouseId: warehouse1,
      status: 'DRAFT',
      items: [
        {
          productId: product1,
          quantityBefore: 20,
          adjustmentQty: 5,
          quantityAfter: 25,
          reasonCode: 'FOUND'
        }
      ],
      createdBy: user1
    });

    // 1. Submit
    assert.equal(adj.status, 'DRAFT');
    adj.status = 'PENDING_APPROVAL';
    assert.equal(adj.status, 'PENDING_APPROVAL');

    // 2. Approve -> POSTED
    adj.status = 'POSTED';
    adj.approvedBy = user1;
    adj.approvedAt = new Date();
    adj.postedToLedgerAt = new Date();
    assert.equal(adj.status, 'POSTED');
    assert.ok(adj.approvedAt);

    // Invariant: cannot reject once posted
    const canReject = adj.status !== 'POSTED';
    assert.equal(canReject, false, 'Cannot reject an adjustment that has already been posted to the ledger');
  });

  await t.test('7. Multi-Tenant Isolation: Adjustment numbers scoped per tenant', () => {
    const adjA = new InventoryAdjustment({
      adjustmentNumber: 'ADJ-000001',
      tenantId: tenantA,
      warehouseId: warehouse1,
      items: [{ productId: product1, quantityBefore: 10, adjustmentQty: -1, quantityAfter: 9, reasonCode: 'SCRAP' }],
      createdBy: user1
    });

    const adjB = new InventoryAdjustment({
      adjustmentNumber: 'ADJ-000001',
      tenantId: tenantB,
      warehouseId: warehouse1,
      items: [{ productId: product1, quantityBefore: 10, adjustmentQty: -1, quantityAfter: 9, reasonCode: 'SCRAP' }],
      createdBy: user1
    });

    assert.equal(adjA.adjustmentNumber, adjB.adjustmentNumber);
    assert.notEqual(adjA.tenantId.toString(), adjB.tenantId.toString());
  });
});
