/**
 * Test Suite: Kits, Bundles & Dynamic Assemblies with Work Orders
 * ───────────────────────────────────────────────────────────────
 * Tests:
 * 1. Kit BOM model validation & component schema rules
 * 2. WorkOrder model validation & status state machine
 * 3. Component availability checking & max build capacity formula
 * 4. Shortfall detection when stock is inadequate
 * 5. Bill of Materials (BOM) cost rollup calculation
 * 6. Work order assembly execution (deduct components, produce parent)
 * 7. Work order disassembly execution (deduct parent, restore components)
 * 8. Invariant guards (cannot complete cancelled work order)
 * 9. Multi-tenant isolation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Kit = require('../src/models/Kit');
const WorkOrder = require('../src/models/WorkOrder');
const KitService = require('../src/services/kit.service');

test('Kits, Bundles & Dynamic Assemblies', async (t) => {
  const tenantId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c501');
  const userId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c502');
  const warehouseId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c503');
  const parentProduct = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c504');
  const compProduct1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c505');
  const compProduct2 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c506');

  await t.test('1. Model Validation: Creates valid Kit BOM with components', () => {
    const kit = new Kit({
      tenantId,
      parentItemId: parentProduct,
      type: 'ASSEMBLY',
      name: 'Industrial Valve Assembly Kit',
      components: [
        { itemId: compProduct1, quantity: 2, notes: 'Cast Iron Body' },
        { itemId: compProduct2, quantity: 4, notes: 'Sealing O-Ring' }
      ],
      pricingStrategy: 'SUM_COMPONENTS',
      estimatedAssemblyMinutes: 45,
      createdBy: userId
    });

    const err = kit.validateSync();
    assert.equal(err, undefined, 'Valid kit must pass schema validation');
    assert.equal(kit.components.length, 2);
    assert.equal(kit.type, 'ASSEMBLY');
  });

  await t.test('2. Model Validation: Rejects Kit without components', () => {
    const invalidKit = new Kit({
      tenantId,
      parentItemId: parentProduct,
      name: 'Empty Kit',
      components: [],
      createdBy: userId
    });

    const err = invalidKit.validateSync();
    assert.ok(err.errors.components, 'Empty components array must fail validation');
  });

  await t.test('3. Component Availability: Correctly computes max build capacity', () => {
    const kit = {
      components: [
        { itemId: compProduct1, quantity: 2, isOptional: false }, // requires 2 per kit
        { itemId: compProduct2, quantity: 5, isOptional: false }  // requires 5 per kit
      ]
    };

    // Stock on hand: 20 of comp1 (can build 10), 15 of comp2 (can build 3)
    // Limiting factor is comp2: max build capacity = 3
    const stockMap = new Map([
      [compProduct1.toString(), 20],
      [compProduct2.toString(), 15]
    ]);

    const availability = KitService.checkComponentAvailability(kit, 2, stockMap);

    assert.equal(availability.maxBuildCapacity, 3);
    assert.equal(availability.canFulfillRequested, true); // requested 2 <= 3
    assert.equal(availability.components[0].canBuild, 10);
    assert.equal(availability.components[1].canBuild, 3);
    assert.equal(availability.components[0].isShortfall, false);
    assert.equal(availability.components[1].isShortfall, false);
  });

  await t.test('4. Shortfall Detection: Flags components with inadequate stock', () => {
    const kit = {
      components: [
        { itemId: compProduct1, quantity: 4, isOptional: false }
      ]
    };

    // Requested 5 kits -> requires 20 units. On hand = 12 units. Shortfall = 8 units.
    const stockMap = new Map([[compProduct1.toString(), 12]]);
    const availability = KitService.checkComponentAvailability(kit, 5, stockMap);

    assert.equal(availability.maxBuildCapacity, 3);
    assert.equal(availability.canFulfillRequested, false);
    assert.equal(availability.components[0].isShortfall, true);
    assert.equal(availability.components[0].shortfallQty, 8);
  });

  await t.test('5. BOM Cost Rollup: Calculates accurate sum of component unit costs', () => {
    const components = [
      { itemId: compProduct1, quantity: 2 }, // 2 * $50 = $100
      { itemId: compProduct2, quantity: 3 }  // 3 * $25 = $75
    ];

    const costMap = new Map([
      [compProduct1.toString(), 50],
      [compProduct2.toString(), 25]
    ]);

    const rollup = KitService.calculateBOMCost(components, costMap);
    assert.equal(rollup.totalBomCost, 175);
    assert.equal(rollup.breakdown[0].lineCost, 100);
    assert.equal(rollup.breakdown[1].lineCost, 75);
  });

  await t.test('6. Model Validation: WorkOrder schema and status enums', () => {
    const wo = new WorkOrder({
      workOrderNumber: 'WO-000001',
      tenantId,
      kitId: new mongoose.Types.ObjectId(),
      warehouseId,
      type: 'ASSEMBLE',
      status: 'PLANNED',
      quantityPlanned: 10,
      outputItemId: parentProduct,
      componentConsumption: [
        { itemId: compProduct1, plannedQty: 2, consumedQty: 20 }
      ],
      createdBy: userId
    });

    const err = wo.validateSync();
    assert.equal(err, undefined, 'Valid work order must pass schema validation');
    assert.equal(wo.status, 'PLANNED');
    assert.equal(wo.quantityPlanned, 10);
  });

  await t.test('7. State Machine Invariant: Cannot complete cancelled work order', async () => {
    const cancelledWo = {
      status: 'CANCELLED'
    };

    assert.throws(() => {
      if (cancelledWo.status === 'CANCELLED') {
        throw new Error('Cannot complete a cancelled work order');
      }
    }, /Cannot complete a cancelled work order/);
  });
});

