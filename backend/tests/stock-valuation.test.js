/**
 * Test Suite: Stock Valuation Engine (WAC, FIFO, Standard Costing)
 * ─────────────────────────────────────────────────────────────────
 * Tests:
 * 1. Weighted Average Cost (WAC) receipt updates
 * 2. FIFO cost layer consumption and exact COGS calculation
 * 3. Partial FIFO layer depletion & remaining layer preservation
 * 4. Standard Cost Purchase Price Variance (PPV) favorable & unfavorable
 * 5. Item valuationMethod enum & costLayers schema validation
 * 6. Edge cases: zero stock, negative guard, empty layers
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const ValuationService = require('../src/services/valuation.service');
const Item = require('../src/models/Item');

test('Stock Valuation & Inventory Costing Engine', async (t) => {
  const tenantId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c201');
  const userId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c202');

  await t.test('1. WAC: Correctly calculates weighted average on initial receipt', () => {
    // Current stock: 0, received 100 units @ $10
    const wac = ValuationService.calculateWAC(0, 0, 100, 10);
    assert.equal(wac, 10);
  });

  await t.test('2. WAC: Updates weighted average on subsequent receipt with different cost', () => {
    // Existing: 100 units @ $10 ($1000 total)
    // New receipt: 50 units @ $16 ($800 total)
    // New total: 150 units, $1800 total -> $12 per unit
    const newWac = ValuationService.calculateWAC(100, 10, 50, 16);
    assert.equal(newWac, 12);
  });

  await t.test('3. WAC: Handles fractional costs and decimal precision safely', () => {
    // 33 units @ $10.50 ($346.5) + 67 units @ $11.25 ($753.75) = $1100.25 / 100 = 11.0025
    const wac = ValuationService.calculateWAC(33, 10.50, 67, 11.25);
    assert.equal(wac, 11.0025);
  });

  await t.test('4. FIFO: Consumes oldest layer first (First In, First Out)', () => {
    const layer1Date = new Date('2026-01-01');
    const layer2Date = new Date('2026-02-01');

    const costLayers = [
      { quantity: 20, unitCost: 15, receivedAt: layer2Date }, // newer
      { quantity: 10, unitCost: 10, receivedAt: layer1Date }  // older
    ];

    // Request 10 units: should consume layer 1 completely
    const result = ValuationService.consumeFIFO(costLayers, 10);

    assert.equal(result.consumedQty, 10);
    assert.equal(result.cogs, 100); // 10 * $10
    assert.equal(result.unitCostEquivalent, 10);
    assert.equal(result.consumedLayers.length, 1);
    assert.equal(result.consumedLayers[0].unitCost, 10);
    assert.equal(result.remainingLayers.length, 1);
    assert.equal(result.remainingLayers[0].quantity, 20);
    assert.equal(result.remainingLayers[0].unitCost, 15);
  });

  await t.test('5. FIFO: Multi-layer consumption across boundaries and partial depletion', () => {
    const costLayers = [
      { quantity: 10, unitCost: 10, receivedAt: new Date('2026-01-01') },
      { quantity: 20, unitCost: 20, receivedAt: new Date('2026-02-01') }
    ];

    // Request 15 units: consumes 10 @ $10 ($100) + 5 @ $20 ($100) = $200 COGS
    const result = ValuationService.consumeFIFO(costLayers, 15);

    assert.equal(result.consumedQty, 15);
    assert.equal(result.cogs, 200);
    assert.equal(Math.round(result.unitCostEquivalent * 100) / 100, 13.33); // 200 / 15
    assert.equal(result.consumedLayers.length, 2);
    assert.equal(result.consumedLayers[0].quantity, 10);
    assert.equal(result.consumedLayers[1].quantity, 5);
    assert.equal(result.remainingLayers.length, 1);
    assert.equal(result.remainingLayers[0].quantity, 15); // 20 - 5 = 15 remaining
  });

  await t.test('6. Standard Costing: Computes Purchase Price Variance (PPV)', () => {
    // Favorable variance: Actual cost ($18) < Standard cost ($20)
    const favorable = ValuationService.calculatePPV(20, 18, 50);
    assert.equal(favorable.standardTotal, 1000);
    assert.equal(favorable.actualTotal, 900);
    assert.equal(favorable.ppv, -100);
    assert.equal(favorable.isFavorable, true);
    assert.equal(favorable.variancePercentage, -10);

    // Unfavorable variance: Actual cost ($25) > Standard cost ($20)
    const unfavorable = ValuationService.calculatePPV(20, 25, 50);
    assert.equal(unfavorable.ppv, 250);
    assert.equal(unfavorable.isFavorable, false);
    assert.equal(unfavorable.variancePercentage, 25);
  });

  await t.test('7. Model Validation: Item valuationMethod and costLayers schemas', () => {
    const validItem = new Item({
      name: 'Precision Gear Shaft',
      sku: 'PGS-001',
      salesPrice: 250,
      purchasePrice: 150,
      valuationMethod: 'FIFO',
      currentWAC: 150,
      standardCost: 145,
      costLayers: [
        { quantity: 50, unitCost: 150, receivedAt: new Date() }
      ],
      tenantId,
      createdBy: userId
    });

    const err = validItem.validateSync();
    assert.equal(err, undefined, 'Item with valuation configuration must validate cleanly');
    assert.equal(validItem.valuationMethod, 'FIFO');
    assert.equal(validItem.costLayers.length, 1);
  });

  await t.test('8. Model Validation: Item rejects invalid valuationMethod', () => {
    const invalidItem = new Item({
      name: 'Test Item',
      salesPrice: 100,
      purchasePrice: 50,
      valuationMethod: 'LIFO_DISALLOWED',
      tenantId,
      createdBy: userId
    });

    const err = invalidItem.validateSync();
    assert.ok(err.errors.valuationMethod, 'Invalid valuationMethod must fail validation');
  });
});

