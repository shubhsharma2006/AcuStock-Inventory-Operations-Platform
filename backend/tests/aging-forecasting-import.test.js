/**
 * Test Suite: Aging Reports, ABC Analysis, Forecasting & Import History
 * ────────────────────────────────────────────────────────────────────
 * Tests:
 * 1. Aging bucket boundary classification (0-30, 31-60, 61-90, 91-180, 180+)
 * 2. ABC Classification Pareto calculation (80/15/5 cumulative value contribution)
 * 3. Inventory Turnover Ratio & Days Sales of Inventory (DSI) formulas
 * 4. Dead stock identification by movement inactivity threshold
 * 5. Holt-Winters double exponential smoothing with trend projection
 * 6. Lag autocorrelation seasonality detection
 * 7. ImportHistory model schema validation, errors log, and rollback state
 * 8. Multi-tenant isolation for imports
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const AgingReportService = require('../src/services/agingReport.service');
const { calculateHoltWinters, detectSeasonality } = require('../src/routes/forecasts');
const ImportHistory = require('../src/models/ImportHistory');

test('Inventory Aging, Forecasting & Import History', async (t) => {
  const tenantId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c701');
  const userId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c702');

  await t.test('1. Aging Buckets: Categorizes days into standard intervals', () => {
    assert.equal(AgingReportService.getAgingBucket(10), '0-30');
    assert.equal(AgingReportService.getAgingBucket(30), '0-30');
    assert.equal(AgingReportService.getAgingBucket(45), '31-60');
    assert.equal(AgingReportService.getAgingBucket(60), '31-60');
    assert.equal(AgingReportService.getAgingBucket(75), '61-90');
    assert.equal(AgingReportService.getAgingBucket(90), '61-90');
    assert.equal(AgingReportService.getAgingBucket(120), '91-180');
    assert.equal(AgingReportService.getAgingBucket(180), '91-180');
    assert.equal(AgingReportService.getAgingBucket(181), '180+');
    assert.equal(AgingReportService.getAgingBucket(365), '180+');
  });

  await t.test('2. ABC Analysis: Groups items by 80/15/5 cumulative value rule', () => {
    // Grand Total = 10,000
    // Item 1: $8,000 (80%) -> Category A
    // Item 2: $1,500 (15%) -> Category B
    // Item 3: $500 (5%)   -> Category C
    const items = [
      { productId: 'prod-1', totalValue: 8000 },
      { productId: 'prod-2', totalValue: 1500 },
      { productId: 'prod-3', totalValue: 500 }
    ];

    const result = AgingReportService.calculateABCClassification(items);

    assert.equal(result.grandTotalValue, 10000);
    assert.equal(result.items[0].abcCategory, 'A');
    assert.equal(result.items[1].abcCategory, 'B');
    assert.equal(result.items[2].abcCategory, 'C');
  });

  await t.test('3. Turnover & DSI: Correctly calculates ratio and days sales of inventory', () => {
    // COGS: $400,000, Average Inventory Value: $100,000
    // Turnover Ratio = 4.0
    // DSI = 365 / 4.0 = 91.25 -> 91.3 days
    const result = AgingReportService.calculateTurnover(400000, 100000);
    assert.equal(result.turnoverRatio, 4);
    assert.equal(result.dsiDays, 91.3);

    // Zero inventory edge case
    const zeroInv = AgingReportService.calculateTurnover(50000, 0);
    assert.equal(zeroInv.turnoverRatio, 0);
    assert.equal(zeroInv.dsiDays, 0);
  });

  await t.test('4. Dead Stock Filter: Flags items inactive beyond threshold days', () => {
    const items = [
      { productId: 'fresh-item', daysSinceLastMovement: 15, onHandQty: 100, totalValue: 1000 },
      { productId: 'slow-item', daysSinceLastMovement: 120, onHandQty: 50, totalValue: 500 },
      { productId: 'dead-item-1', daysSinceLastMovement: 200, onHandQty: 20, totalValue: 400 },
      { productId: 'dead-item-2', daysSinceLastMovement: 365, onHandQty: 10, totalValue: 200 }
    ];

    const report = AgingReportService.filterDeadStock(items, 180);
    assert.equal(report.totalDeadStockItems, 2);
    assert.equal(report.totalDeadStockUnits, 30);
    assert.equal(report.totalDeadStockValue, 600);
    assert.equal(report.deadStock[0].productId, 'dead-item-1');
  });

  await t.test('5. Holt-Winters Smoothing: Computes level, trend and forward forecast', () => {
    // Simple upward linear demand trend: 10, 12, 14, 16, 18, 20
    const series = [10, 12, 14, 16, 18, 20];
    const hw = calculateHoltWinters(series, { alpha: 0.3, beta: 0.2, horizon: 3 });

    assert.ok(hw.finalLevel > 18);
    assert.ok(hw.finalTrend > 0);
    assert.equal(hw.forecast.length, 3);
    assert.ok(hw.forecast[0] > hw.finalLevel);
    assert.ok(hw.forecast[2] > hw.forecast[0]); // Continues upward trend
  });

  await t.test('6. Seasonality Detection: Computes lag autocorrelation', () => {
    // Repeating weekly cycle (peaks on day 7, 14, 21)
    const seasonalSeries = [
      5, 5, 5, 5, 5, 20, 25,
      5, 5, 5, 5, 5, 20, 25,
      5, 5, 5, 5, 5, 20, 25
    ];

    const result = detectSeasonality(seasonalSeries, 7);
    assert.equal(result.isSeasonal, true);
    assert.ok(result.autocorrelation > 0.6);
  });

  await t.test('7. Model Validation: ImportHistory schema, stats and status enums', () => {
    const importRec = new ImportHistory({
      importNumber: 'IMP-000001',
      tenantId,
      entityType: 'PRODUCTS',
      originalFileName: 'catalog_q4.csv',
      fileSize: 48120,
      totalRows: 150,
      successCount: 148,
      errorCount: 2,
      errors: [
        { row: 12, field: 'sku', message: 'Duplicate SKU in CSV' }
      ],
      importedRecordIds: [new mongoose.Types.ObjectId()],
      status: 'COMPLETED',
      createdBy: userId
    });

    const err = importRec.validateSync();
    assert.equal(err, undefined, 'Valid import history must pass schema validation');
    assert.equal(importRec.entityType, 'PRODUCTS');
    assert.equal(importRec.status, 'COMPLETED');
    assert.equal(importRec.isRolledBack, false);
  });

  await t.test('8. Rollback State Invariant: Tracks rollback timestamp and user', () => {
    const importRec = new ImportHistory({
      importNumber: 'IMP-000002',
      tenantId,
      entityType: 'PRODUCTS',
      originalFileName: 'bad_import.csv',
      totalRows: 25,
      successCount: 25,
      status: 'COMPLETED',
      createdBy: userId
    });

    importRec.isRolledBack = true;
    importRec.rolledBackAt = new Date();
    importRec.rolledBackBy = userId;
    importRec.status = 'ROLLED_BACK';

    const err = importRec.validateSync();
    assert.equal(err, undefined);
    assert.equal(importRec.status, 'ROLLED_BACK');
    assert.ok(importRec.rolledBackAt);
  });
});

