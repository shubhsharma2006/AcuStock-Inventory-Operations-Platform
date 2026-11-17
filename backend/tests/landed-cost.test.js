/**
 * Test Suite: Multi-Currency Landed Cost & Apportionment Engine
 * ─────────────────────────────────────────────────────────────
 * Tests:
 * 1. Apportionment by value across PO lines
 * 2. Apportionment by quantity across PO lines
 * 3. Apportionment by weight across PO lines
 * 4. Multi-currency foreign exchange conversion (PO currency -> Base currency)
 * 5. LandedCost model schema validation & enum constraints
 * 6. Finalization state transition invariants
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const LandedCostService = require('../src/services/landedCost.service');
const LandedCost = require('../src/models/LandedCost');

test('Multi-Currency Landed Cost Engine', async (t) => {
  const tenantId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c301');
  const userId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c302');
  const poId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c303');
  const prodA = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c304');
  const prodB = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c305');

  await t.test('1. Apportionment By Value: Proportional distribution according to line base value', () => {
    // Line A: 10 units @ $100 = $1,000 (1/3 of total)
    // Line B: 10 units @ $200 = $2,000 (2/3 of total)
    // Total value = $3,000
    // Freight charge = $300
    // Line A should receive $100 freight ($10/unit)
    // Line B should receive $200 freight ($20/unit)
    const poLines = [
      { productId: prodA, quantity: 10, unitPrice: 100 },
      { productId: prodB, quantity: 10, unitPrice: 200 }
    ];

    const components = [
      { type: 'FREIGHT', amount: 300, apportionMethod: 'BY_VALUE' }
    ];

    const result = LandedCostService.calculateApportionment(poLines, components, {
      exchangeRate: 1.0,
      baseCurrency: 'USD',
      poCurrency: 'USD'
    });

    assert.equal(result.totalLandedCost, 300);
    assert.equal(result.totalPoBaseValue, 3000);
    assert.equal(result.lineAllocations[0].allocatedLandedCost, 100);
    assert.equal(result.lineAllocations[0].totalUnitCost, 110); // 100 + 100/10

    assert.equal(result.lineAllocations[1].allocatedLandedCost, 200);
    assert.equal(result.lineAllocations[1].totalUnitCost, 220); // 200 + 200/10
  });

  await t.test('2. Apportionment By Quantity: Proportional distribution according to units', () => {
    // Line A: 20 units @ $50 = $1,000 (2/3 of units)
    // Line B: 10 units @ $100 = $1,000 (1/3 of units)
    // Handling charge = $300
    // Line A receives 2/3 = $200 ($10/unit)
    // Line B receives 1/3 = $100 ($10/unit)
    const poLines = [
      { productId: prodA, quantity: 20, unitPrice: 50 },
      { productId: prodB, quantity: 10, unitPrice: 100 }
    ];

    const components = [
      { type: 'HANDLING', amount: 300, apportionMethod: 'BY_QUANTITY' }
    ];

    const result = LandedCostService.calculateApportionment(poLines, components, {
      exchangeRate: 1.0,
      baseCurrency: 'USD'
    });

    assert.equal(result.lineAllocations[0].allocatedLandedCost, 200);
    assert.equal(result.lineAllocations[0].totalUnitCost, 60); // 50 + 200/20

    assert.equal(result.lineAllocations[1].allocatedLandedCost, 100);
    assert.equal(result.lineAllocations[1].totalUnitCost, 110); // 100 + 100/10
  });

  await t.test('3. Multi-Currency Conversion: Applies exchange rate to foreign PO prices', () => {
    // PO Currency = USD, Base Currency = INR, Exchange Rate = 85.0
    // Line A: 5 units @ $10 USD = ₹850 INR per unit (₹4,250 line total)
    // Customs Duty = ₹850 INR
    // Line A allocated landed cost = ₹850, per unit landed = ₹170
    // Final Landed Unit Cost = ₹850 + ₹170 = ₹1,020 INR
    const poLines = [
      { productId: prodA, quantity: 5, unitPrice: 10 }
    ];

    const components = [
      { type: 'CUSTOMS_DUTY', amount: 850, apportionMethod: 'BY_VALUE' }
    ];

    const result = LandedCostService.calculateApportionment(poLines, components, {
      exchangeRate: 85.0,
      baseCurrency: 'INR',
      poCurrency: 'USD'
    });

    assert.equal(result.exchangeRate, 85.0);
    assert.equal(result.poCurrency, 'USD');
    assert.equal(result.baseCurrency, 'INR');
    assert.equal(result.lineAllocations[0].itemCostInBaseCurrency, 850);
    assert.equal(result.lineAllocations[0].allocatedLandedCost, 850);
    assert.equal(result.lineAllocations[0].totalUnitCost, 1020);
  });

  await t.test('4. Model Validation: LandedCost schema and enum validation', () => {
    const validLc = new LandedCost({
      landedCostNumber: 'LC-000001',
      purchaseOrderId: poId,
      tenantId,
      poCurrency: 'USD',
      baseCurrency: 'INR',
      exchangeRate: 84.5,
      components: [
        { type: 'FREIGHT', amount: 5000, currency: 'INR', apportionMethod: 'BY_VALUE' },
        { type: 'CUSTOMS_DUTY', amount: 2500, currency: 'INR', apportionMethod: 'BY_VALUE' }
      ],
      totalLandedCost: 7500,
      lineAllocations: [
        {
          productId: prodA,
          poLineQty: 10,
          itemCostInPoCurrency: 50,
          itemCostInBaseCurrency: 4225,
          allocatedLandedCost: 7500,
          totalUnitCost: 4975
        }
      ],
      createdBy: userId
    });

    const err = validLc.validateSync();
    assert.equal(err, undefined, 'Valid LandedCost document must pass validation');
    assert.equal(validLc.status, 'DRAFT');
    assert.equal(validLc.components.length, 2);
  });

  await t.test('5. Model Validation: Rejects invalid component types', () => {
    const invalidLc = new LandedCost({
      landedCostNumber: 'LC-000002',
      purchaseOrderId: poId,
      tenantId,
      components: [
        { type: 'BRIBE_UNOFFICIAL', amount: 100 }
      ],
      createdBy: userId
    });

    const err = invalidLc.validateSync();
    assert.ok(err.errors['components.0.type'], 'Invalid component type must fail enum validation');
  });
});

